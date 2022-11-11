"""task_manager.py: manage tasks dispatching and render threads.
Notes:
    render_threads should be the only hard reference held by the manager to the threads.
    Use weak_thread_data to store all other data using weak keys.
    This will allow for garbage collection after the thread dies.
"""
import json
import traceback

TASK_TTL = 15 * 60 # seconds, Discard last session's task timeout

import queue, threading, time, weakref
from typing import Any, Generator, Hashable, Optional, Union

from pydantic import BaseModel
from sd_internal import Request, Response

THREAD_NAME_PREFIX = 'Runtime-Render/'
ERR_LOCK_FAILED = ' failed to acquire lock within timeout.'
LOCK_TIMEOUT = 15 # Maximum locking time in seconds before failing a task.
# It's better to get an exception than a deadlock... ALWAYS use timeout in critical paths.

DEVICE_START_TIMEOUT = 60 # seconds - Maximum time to wait for a render device to init.
CPU_UNLOAD_TIMEOUT = 4 * 60 # seconds - Idle time before CPU unload resource when GPUs are present.

class SymbolClass(type): # Print nicely formatted Symbol names.
    def __repr__(self): return self.__qualname__
    def __str__(self): return self.__name__
class Symbol(metaclass=SymbolClass): pass

class ServerStates:
    class Init(Symbol): pass
    class LoadingModel(Symbol): pass
    class Online(Symbol): pass
    class Rendering(Symbol): pass
    class Unavailable(Symbol): pass

class RenderTask(): # Task with output queue and completion lock.
    def __init__(self, req: Request):
        self.request: Request = req # Initial Request
        self.response: Any = None # Copy of the last reponse
        self.render_device = None
        self.temp_images:list = [None] * req.num_outputs * (1 if req.show_only_filtered_image else 2)
        self.error: Exception = None
        self.lock: threading.Lock = threading.Lock() # Locks at task start and unlocks when task is completed
        self.buffer_queue: queue.Queue = queue.Queue() # Queue of JSON string segments
    async def read_buffer_generator(self):
        try:
            while not self.buffer_queue.empty():
                res = self.buffer_queue.get(block=False)
                self.buffer_queue.task_done()
                yield res
        except queue.Empty as e: yield

# defaults from https://huggingface.co/blog/stable_diffusion
class ImageRequest(BaseModel):
    session_id: str = "session"
    prompt: str = ""
    negative_prompt: str = ""
    init_image: str = None # base64
    mask: str = None # base64
    num_outputs: int = 1
    num_inference_steps: int = 50
    guidance_scale: float = 7.5
    width: int = 512
    height: int = 512
    seed: int = 42
    prompt_strength: float = 0.8
    sampler: str = None # "ddim", "plms", "heun", "euler", "euler_a", "dpm2", "dpm2_a", "lms"
    # allow_nsfw: bool = False
    save_to_disk_path: str = None
    turbo: bool = True
    use_cpu: bool = False ##TODO Remove after UI and plugins transition.
    render_device: str = None
    use_full_precision: bool = False
    use_face_correction: str = None # or "GFPGANv1.3"
    use_upscale: str = None # or "RealESRGAN_x4plus" or "RealESRGAN_x4plus_anime_6B"
    use_stable_diffusion_model: str = "sd-v1-4"
    use_vae_model: str = None
    show_only_filtered_image: bool = False
    output_format: str = "jpeg" # or "png"

    stream_progress_updates: bool = False
    stream_image_progress: bool = False

class FilterRequest(BaseModel):
    session_id: str = "session"
    model: str = None
    name: str = ""
    init_image: str = None # base64
    width: int = 512
    height: int = 512
    save_to_disk_path: str = None
    turbo: bool = True
    render_device: str = None
    use_full_precision: bool = False
    output_format: str = "jpeg" # or "png"

# Temporary cache to allow to query tasks results for a short time after they are completed.
class TaskCache():
    def __init__(self):
        self._base = dict()
        self._lock: threading.Lock = threading.Lock()
    def _get_ttl_time(self, ttl: int) -> int:
        return int(time.time()) + ttl
    def _is_expired(self, timestamp: int) -> bool:
        return int(time.time()) >= timestamp
    def clean(self) -> None:
        if not self._lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('TaskCache.clean' + ERR_LOCK_FAILED)
        try:
            # Create a list of expired keys to delete
            to_delete = []
            for key in self._base:
                ttl, _ = self._base[key]
                if self._is_expired(ttl):
                    to_delete.append(key)
            # Remove Items
            for key in to_delete:
                del self._base[key]
                print(f'Session {key} expired. Data removed.')
        finally:
            self._lock.release()
    def clear(self) -> None:
        if not self._lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('TaskCache.clear' + ERR_LOCK_FAILED)
        try: self._base.clear()
        finally: self._lock.release()
    def delete(self, key: Hashable) -> bool:
        if not self._lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('TaskCache.delete' + ERR_LOCK_FAILED)
        try:
            if key not in self._base:
                return False
            del self._base[key]
            return True
        finally:
            self._lock.release()
    def keep(self, key: Hashable, ttl: int) -> bool:
        if not self._lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('TaskCache.keep' + ERR_LOCK_FAILED)
        try:
            if key in self._base:
                _, value = self._base.get(key)
                self._base[key] = (self._get_ttl_time(ttl), value)
                return True
            return False
        finally:
            self._lock.release()
    def put(self, key: Hashable, value: Any, ttl: int) -> bool:
        if not self._lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('TaskCache.put' + ERR_LOCK_FAILED)
        try:
            self._base[key] = (
                self._get_ttl_time(ttl), value
            )
        except Exception as e:
            print(str(e))
            print(traceback.format_exc())
            return False
        else:
            return True
        finally:
            self._lock.release()
    def tryGet(self, key: Hashable) -> Any:
        if not self._lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('TaskCache.tryGet' + ERR_LOCK_FAILED)
        try:
            ttl, value = self._base.get(key, (None, None))
            if ttl is not None and self._is_expired(ttl):
                print(f'Session {key} expired. Discarding data.')
                del self._base[key]
                return None
            return value
        finally:
            self._lock.release()

manager_lock = threading.RLock()
render_threads = []
current_state = ServerStates.Init
current_state_error:Exception = None
current_model_path = None
current_vae_path = None
tasks_queue = []
task_cache = TaskCache()
default_model_to_load = None
default_vae_to_load = None
weak_thread_data = weakref.WeakKeyDictionary()

def preload_model(ckpt_file_path=None, vae_file_path=None):
    global current_state, current_state_error, current_model_path
    if ckpt_file_path == None:
        ckpt_file_path = default_model_to_load
    if vae_file_path == None:
        vae_file_path = default_vae_to_load
    if ckpt_file_path == current_model_path and vae_file_path == current_vae_path:
        return
    current_state = ServerStates.LoadingModel
    try:
        from . import runtime
        runtime.thread_data.ckpt_file = ckpt_file_path
        runtime.thread_data.vae_file = vae_file_path
        runtime.load_model_ckpt()
        current_model_path = ckpt_file_path
        current_vae_path = vae_file_path
        current_state_error = None
        current_state = ServerStates.Online
    except Exception as e:
        current_model_path = None
        current_vae_path = None
        current_state_error = e
        current_state = ServerStates.Unavailable
        print(traceback.format_exc())

def thread_get_next_task():
    from . import runtime
    if not manager_lock.acquire(blocking=True, timeout=LOCK_TIMEOUT):
        print('Render thread on device', runtime.thread_data.device, 'failed to acquire manager lock.')
        return None
    if len(tasks_queue) <= 0:
        manager_lock.release()
        return None
    task = None
    try:  # Select a render task.
        for queued_task in tasks_queue:
            if queued_task.request.use_face_correction:  # TODO Remove when fixed - A bug with GFPGANer and facexlib needs to be fixed before use on other devices.
                if is_alive(0) <= 0:  # Allows GFPGANer only on cuda:0.
                    queued_task.error = Exception('cuda:0 is not available with the current config. Remove GFPGANer filter to run task.')
                    task = queued_task
                    break
                if queued_task.render_device == 'cpu':
                    queued_task.error = Exception('Cpu cannot be used to run this task. Remove GFPGANer filter to run task.')
                    task = queued_task
                    break
                if not runtime.is_first_cuda_device(runtime.thread_data.device):
                    continue  # Wait for cuda:0
            if queued_task.render_device and runtime.thread_data.device != queued_task.render_device:
                # Is asking for a specific render device.
                if is_alive(queued_task.render_device) > 0:
                    continue  # requested device alive, skip current one.
                else:
                    # Requested device is not active, return error to UI.
                    queued_task.error = Exception(str(queued_task.render_device) + ' is not currently active.')
                    task = queued_task
                    break
            if not queued_task.render_device and runtime.thread_data.device == 'cpu' and is_alive() > 1:
                # not asking for any specific devices, cpu want to grab task but other render devices are alive.
                continue  # Skip Tasks, don't run on CPU unless there is nothing else or user asked for it.
            task = queued_task
            break
        if task is not None:
            del tasks_queue[tasks_queue.index(task)]
        return task
    finally:
        manager_lock.release()

def thread_render(device):
    global current_state, current_state_error, current_model_path, current_vae_path
    from . import runtime
    try:
        runtime.device_init(device)
    except Exception as e:
        print(traceback.format_exc())
        weak_thread_data[threading.current_thread()] = {
            'error': e
        }
        return
    weak_thread_data[threading.current_thread()] = {
        'device': runtime.thread_data.device,
        'device_name': runtime.thread_data.device_name
    }
    if runtime.thread_data.device != 'cpu' or is_alive() == 1:
        preload_model()
        current_state = ServerStates.Online
    while True:
        task_cache.clean()
        if isinstance(current_state_error, SystemExit):
            current_state = ServerStates.Unavailable
            return
        task = thread_get_next_task()
        if task is None:
            if runtime.thread_data.device == 'cpu' and is_alive() > 1 and hasattr(runtime.thread_data, 'lastActive') and time.time() - runtime.thread_data.lastActive > CPU_UNLOAD_TIMEOUT:
                # GPUs present and CPU is idle. Unload resources.
                runtime.unload_models()
                runtime.unload_filters()
                del runtime.thread_data.lastActive
            time.sleep(1)
            continue
        if task.error is not None:
            print(task.error)
            task.response = {"status": 'failed', "detail": str(task.error)}
            task.buffer_queue.put(json.dumps(task.response))
            continue
        if current_state_error:
            task.error = current_state_error
            task.response = {"status": 'failed', "detail": str(task.error)}
            task.buffer_queue.put(json.dumps(task.response))
            continue
        print(f'Session {task.request.session_id} starting task {id(task)} on {runtime.thread_data.device_name}')
        if not task.lock.acquire(blocking=False): raise Exception('Got locked task from queue.')
        try:
            if runtime.thread_data.device == 'cpu' and is_alive() > 1:
                # CPU is not the only device. Keep track of active time to unload resources later.
                runtime.thread_data.lastActive = time.time()
            # Open data generator.
            res = runtime.mk_img(task.request)
            if current_model_path == task.request.use_stable_diffusion_model:
                current_state = ServerStates.Rendering
            else:
                current_state = ServerStates.LoadingModel
            # Start reading from generator.
            dataQueue = None
            if task.request.stream_progress_updates:
                dataQueue = task.buffer_queue
            for result in res:
                if current_state == ServerStates.LoadingModel:
                    current_state = ServerStates.Rendering
                    current_model_path = task.request.use_stable_diffusion_model
                    current_vae_path = task.request.use_vae_model
                if isinstance(current_state_error, SystemExit) or isinstance(current_state_error, StopAsyncIteration) or isinstance(task.error, StopAsyncIteration):
                    runtime.thread_data.stop_processing = True
                    if isinstance(current_state_error, StopAsyncIteration):
                        task.error = current_state_error
                        current_state_error = None
                        print(f'Session {task.request.session_id} sent cancel signal for task {id(task)}')
                if dataQueue:
                    dataQueue.put(result)
                if isinstance(result, str):
                    result = json.loads(result)
                task.response = result
                if 'output' in result:
                    for out_obj in result['output']:
                        if 'path' in out_obj:
                            img_id = out_obj['path'][out_obj['path'].rindex('/') + 1:]
                            task.temp_images[int(img_id)] = runtime.thread_data.temp_images[out_obj['path'][11:]]
                        elif 'data' in out_obj:
                            buf = runtime.base64_str_to_buffer(out_obj['data'])
                            task.temp_images[result['output'].index(out_obj)] = buf
                # Before looping back to the generator, mark cache as still alive.
                task_cache.keep(task.request.session_id, TASK_TTL)
        except Exception as e:
            task.error = e
            print(traceback.format_exc())
            continue
        finally:
            # Task completed
            task.lock.release()
        task_cache.keep(task.request.session_id, TASK_TTL)
        if isinstance(task.error, StopAsyncIteration):
            print(f'Session {task.request.session_id} task {id(task)} cancelled!')
        elif task.error is not None:
            print(f'Session {task.request.session_id} task {id(task)} failed!')
        else:
            print(f'Session {task.request.session_id} task {id(task)} completed by {runtime.thread_data.device_name}.')
        current_state = ServerStates.Online

def get_cached_task(session_id:str, update_ttl:bool=False):
    # By calling keep before tryGet, wont discard if was expired.
    if update_ttl and not task_cache.keep(session_id, TASK_TTL):
        # Failed to keep task, already gone.
        return None
    return task_cache.tryGet(session_id)

def get_devices():
    if not manager_lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('get_devices' + ERR_LOCK_FAILED)
    try:
        device_dict = {}
        for rthread in render_threads:
            if not rthread.is_alive():
                continue
            weak_data = weak_thread_data.get(rthread)
            if not weak_data or not 'device' in weak_data or not 'device_name' in weak_data:
                continue
            device_dict.update({weak_data['device']:weak_data['device_name']})
        return device_dict
    finally:
        manager_lock.release()

def is_first_cuda_device(device):
    from . import runtime # When calling runtime from outside thread_render DO NOT USE thread specific attributes or functions.
    return runtime.is_first_cuda_device(device)

def is_alive(name=None):
    if not manager_lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('is_alive' + ERR_LOCK_FAILED)
    nbr_alive = 0
    try:
        for rthread in render_threads:
            if name is not None:
                weak_data = weak_thread_data.get(rthread)
                if weak_data is None or not 'device' in weak_data or weak_data['device'] is None:
                    continue
                thread_name = str(weak_data['device']).lower()
                if is_first_cuda_device(name):
                    if not is_first_cuda_device(thread_name):
                        continue
                elif thread_name != name:
                    continue
            if rthread.is_alive():
                nbr_alive += 1
        return nbr_alive
    finally:
        manager_lock.release()

def start_render_thread(device='auto'):
    if not manager_lock.acquire(blocking=True, timeout=LOCK_TIMEOUT): raise Exception('start_render_threads' + ERR_LOCK_FAILED)
    print('Start new Rendering Thread on device', device)
    try:
        rthread = threading.Thread(target=thread_render, kwargs={'device': device})
        rthread.daemon = True
        rthread.name = THREAD_NAME_PREFIX + device
        rthread.start()
        render_threads.append(rthread)
    finally:
        manager_lock.release()
    timeout = DEVICE_START_TIMEOUT
    while not rthread.is_alive() or not rthread in weak_thread_data or not 'device' in weak_thread_data[rthread]:
        if rthread in weak_thread_data and 'error' in weak_thread_data[rthread]:
            return False
        if timeout <= 0:
            return False
        timeout -= 1
        time.sleep(1)
    return True

def shutdown_event(): # Signal render thread to close on shutdown
    global current_state_error
    current_state_error = SystemExit('Application shutting down.')

def render(req : ImageRequest):
    if is_alive() <= 0: # Render thread is dead
        raise ChildProcessError('Rendering thread has died.')
    # Alive, check if task in cache
    task = task_cache.tryGet(req.session_id)
    if task and not task.response and not task.error and not task.lock.locked():
        # Unstarted task pending, deny queueing more than one.
        raise ConnectionRefusedError(f'Session {req.session_id} has an already pending task.')
    #
    from . import runtime
    r = Request()
    r.session_id = req.session_id
    r.prompt = req.prompt
    r.negative_prompt = req.negative_prompt
    r.init_image = req.init_image
    r.mask = req.mask
    r.num_outputs = req.num_outputs
    r.num_inference_steps = req.num_inference_steps
    r.guidance_scale = req.guidance_scale
    r.width = req.width
    r.height = req.height
    r.seed = req.seed
    r.prompt_strength = req.prompt_strength
    r.sampler = req.sampler
    # r.allow_nsfw = req.allow_nsfw
    r.turbo = req.turbo
    r.use_full_precision = req.use_full_precision
    r.save_to_disk_path = req.save_to_disk_path
    r.use_upscale: str = req.use_upscale
    r.use_face_correction = req.use_face_correction
    r.use_stable_diffusion_model = req.use_stable_diffusion_model
    r.use_vae_model = req.use_vae_model
    r.show_only_filtered_image = req.show_only_filtered_image
    r.output_format = req.output_format

    r.stream_progress_updates = True # the underlying implementation only supports streaming
    r.stream_image_progress = req.stream_image_progress

    if not req.stream_progress_updates:
        r.stream_image_progress = False

    new_task = RenderTask(r)
    new_task.render_device = req.render_device

    if task_cache.put(r.session_id, new_task, TASK_TTL):
        # Use twice the normal timeout for adding user requests.
        # Tries to force task_cache.put to fail before tasks_queue.put would. 
        if manager_lock.acquire(blocking=True, timeout=LOCK_TIMEOUT * 2):
            try:
                tasks_queue.append(new_task)
                return new_task
            finally:
                manager_lock.release()
    raise RuntimeError('Failed to add task to cache.')
