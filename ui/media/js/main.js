"use strict" // Opt in to a restricted variant of JavaScript
const MAX_INIT_IMAGE_DIMENSION = 768
const MIN_GPUS_TO_SHOW_SELECTION = 2

const IMAGE_REGEX = new RegExp('data:image/[A-Za-z]+;base64')
const htmlTaskMap = new WeakMap()

let promptField = document.querySelector('#prompt')
let promptsFromFileSelector = document.querySelector('#prompt_from_file')
let promptsFromFileBtn = document.querySelector('#promptsFromFileBtn')
let negativePromptField = document.querySelector('#negative_prompt')
let numOutputsTotalField = document.querySelector('#num_outputs_total')
let numOutputsParallelField = document.querySelector('#num_outputs_parallel')
let numInferenceStepsField = document.querySelector('#num_inference_steps')
let guidanceScaleSlider = document.querySelector('#guidance_scale_slider')
let guidanceScaleField = document.querySelector('#guidance_scale')
let outputQualitySlider = document.querySelector('#output_quality_slider')
let outputQualityField = document.querySelector('#output_quality')
let outputQualityRow = document.querySelector('#output_quality_row')
let randomSeedField = document.querySelector("#random_seed")
let seedField = document.querySelector('#seed')
let widthField = document.querySelector('#width')
let heightField = document.querySelector('#height')
let initImageSelector = document.querySelector("#init_image")
let initImagePreview = document.querySelector("#init_image_preview")
let initImageSizeBox = document.querySelector("#init_image_size_box")
let maskImageSelector = document.querySelector("#mask")
let maskImagePreview = document.querySelector("#mask_preview")
let promptStrengthSlider = document.querySelector('#prompt_strength_slider')
let promptStrengthField = document.querySelector('#prompt_strength')
let samplerField = document.querySelector('#sampler')
let samplerSelectionContainer = document.querySelector("#samplerSelection")
let useFaceCorrectionField = document.querySelector("#use_face_correction")
let useUpscalingField = document.querySelector("#use_upscale")
let upscaleModelField = document.querySelector("#upscale_model")
let stableDiffusionModelField = document.querySelector('#stable_diffusion_model')
let vaeModelField = document.querySelector('#vae_model')
let outputFormatField = document.querySelector('#output_format')
let showOnlyFilteredImageField = document.querySelector("#show_only_filtered_image")
let updateBranchLabel = document.querySelector("#updateBranchLabel")
let streamImageProgressField = document.querySelector("#stream_image_progress")

let makeImageBtn = document.querySelector('#makeImage')
let stopImageBtn = document.querySelector('#stopImage')

let imagesContainer = document.querySelector('#current-images')
let initImagePreviewContainer = document.querySelector('#init_image_preview_container')
let initImageClearBtn = document.querySelector('.init_image_clear')
let promptStrengthContainer = document.querySelector('#prompt_strength_container')

let initialText = document.querySelector("#initial-text")
let previewTools = document.querySelector("#preview-tools")
let clearAllPreviewsBtn = document.querySelector("#clear-all-previews")

let maskSetting = document.querySelector('#enable_mask')

const processOrder = document.querySelector('#process_order_toggle')

let imagePreview = document.querySelector("#preview")
imagePreview.addEventListener('drop', function(ev) {
    const data = ev.dataTransfer?.getData("text/plain");
    if (!data) {
        return
    }
    const movedTask = document.getElementById(data)
    if (!movedTask) {
        return
    }
    ev.preventDefault()
    let moveTarget = ev.target
    while (moveTarget && typeof moveTarget === 'object' && moveTarget.parentNode !== imagePreview) {
        moveTarget = moveTarget.parentNode
    }
    if (moveTarget === initialText || moveTarget === previewTools) {
        moveTarget = null
    }
    if (moveTarget === movedTask) {
        return
    }
    if (moveTarget) {
        const childs = Array.from(imagePreview.children)
        if (moveTarget.nextSibling && childs.indexOf(movedTask) < childs.indexOf(moveTarget)) {
            // Move after the target if lower than current position.
            moveTarget = moveTarget.nextSibling
        }
    }
    const newNode = imagePreview.insertBefore(movedTask, moveTarget || previewTools.nextSibling)
    if (newNode === movedTask) {
        return
    }
    imagePreview.removeChild(movedTask)
    const task = htmlTaskMap.get(movedTask)
    if (task) {
        htmlTaskMap.delete(movedTask)
    }
    if (task) {
        htmlTaskMap.set(newNode, task)
    }
})

let showConfigToggle = document.querySelector('#configToggleBtn')
// let configBox = document.querySelector('#config')
// let outputMsg = document.querySelector('#outputMsg')

let soundToggle = document.querySelector('#sound_toggle')

let serverStatusColor = document.querySelector('#server-status-color')
let serverStatusMsg = document.querySelector('#server-status-msg')

function getLocalStorageBoolItem(key, fallback) {
    let item = localStorage.getItem(key)
    if (item === null) {
        return fallback
    }

    return (item === 'true' ? true : false)
}

function handleBoolSettingChange(key) {
    return function(e) {
        localStorage.setItem(key, e.target.checked.toString())
    }
}

function handleStringSettingChange(key) {
    return function(e) {
        localStorage.setItem(key, e.target.value.toString())
    }
}

function isSoundEnabled() {
    return getSetting("sound_toggle")
}

function getSavedDiskPath() {
    return getSetting("diskPath")
}

function setStatus(statusType, msg, msgType) {
}

function setServerStatus(event) {
    switch(event.type) {
        case 'online':
            serverStatusColor.style.color = 'green'
            serverStatusMsg.style.color = 'green'
            serverStatusMsg.innerText = 'Stable Diffusion is ' + event.message
            break
        case 'busy':
            serverStatusColor.style.color = 'rgb(200, 139, 0)'
            serverStatusMsg.style.color = 'rgb(200, 139, 0)'
            serverStatusMsg.innerText = 'Stable Diffusion is ' + event.message
            break
        case 'error':
            serverStatusColor.style.color = 'red'
            serverStatusMsg.style.color = 'red'
            serverStatusMsg.innerText = 'Stable Diffusion has stopped'
            break
    }
    if (SD.serverState.devices) {
        setSystemInfo(SD.serverState.devices)
    }
}

// shiftOrConfirm(e, prompt, fn)
//   e      : MouseEvent
//   prompt : Text to be shown as prompt. Should be a question to which "yes" is a good answer.
//   fn     : function to be called if the user confirms the dialog or has the shift key pressed
//
// If the user had the shift key pressed while clicking, the function fn will be executed.
// If the setting "confirm_dangerous_actions" in the system settings is disabled, the function 
// fn will be executed.
// Otherwise, a confirmation dialog is shown. If the user confirms, the function fn will also
// be executed.
function shiftOrConfirm(e, prompt, fn) {
    e.stopPropagation()
    if (e.shiftKey || !confirmDangerousActionsField.checked) {
         fn(e)
    } else {
        $.confirm({
            theme: 'modern',
            title: prompt,
            useBootstrap: false,
            animateFromElement: false,
            content: '<small>Tip: To skip this dialog, use shift-click or disable the "Confirm dangerous actions" setting in the Settings tab.</small>',
            buttons: {
                yes: () => { fn(e) },
                cancel: () => {}
            }
        }); 
    }
}

function logMsg(msg, level, outputMsg) {
    if (outputMsg.hasChildNodes()) {
        outputMsg.appendChild(document.createElement('br'))
    }
    if (level === 'error') {
        outputMsg.innerHTML += '<span style="color: red">Error: ' + msg + '</span>'
    } else if (level === 'warn') {
        outputMsg.innerHTML += '<span style="color: orange">Warning: ' + msg + '</span>'
    } else {
        outputMsg.innerText += msg
    }
    console.log(level, msg)
}

function logError(msg, res, outputMsg) {
    logMsg(msg, 'error', outputMsg)

    console.log('request error', res)
    setStatus('request', 'error', 'error')
}

function playSound() {
    const audio = new Audio('/media/ding.mp3')
    audio.volume = 0.2
    const promise = audio.play()
    if (promise !== undefined) {
        promise.then(_ => {}).catch(error => {
            console.warn("browser blocked autoplay")
        })
    }
}

function setSystemInfo(devices) {
    let cpu = devices.all.cpu.name
    let allGPUs = Object.keys(devices.all).filter(d => d != 'cpu')
    let activeGPUs = Object.keys(devices.active)

    function ID_TO_TEXT(d) {
        let info = devices.all[d]
        if ("mem_free" in info && "mem_total" in info) {
            return `${info.name} <small>(${d}) (${info.mem_free.toFixed(1)}Gb free / ${info.mem_total.toFixed(1)} Gb total)</small>`
        } else {
            return `${info.name} <small>(${d}) (no memory info)</small>`
        }
    }

    allGPUs = allGPUs.map(ID_TO_TEXT)
    activeGPUs = activeGPUs.map(ID_TO_TEXT)

    let systemInfo = `
    <table>
        <tr><td><label>Processor:</label></td><td class="value">${cpu}</td></tr>
        <tr><td><label>Compatible Graphics Cards (all):</label></td><td class="value">${allGPUs.join('</br>')}</td></tr>
        <tr><td></td><td>&nbsp;</td></tr>
        <tr><td><label>Used for rendering 🔥:</label></td><td class="value">${activeGPUs.join('</br>')}</td></tr>
    </table>`

    let systemInfoEl = document.querySelector('#system-info')
    systemInfoEl.innerHTML = systemInfo
}

function showImages(reqBody, res, outputContainer, livePreview) {
    let imageItemElements = outputContainer.querySelectorAll('.imgItem')
    if(typeof res != 'object') return
    res.output.reverse()
    res.output.forEach((result, index) => {
        const imageData = result?.data || result?.path + '?t=' + Date.now(),
            imageSeed = result?.seed,
            imagePrompt = reqBody.prompt,
            imageInferenceSteps = reqBody.num_inference_steps,
            imageGuidanceScale = reqBody.guidance_scale,
            imageWidth = reqBody.width,
            imageHeight = reqBody.height;

        if (!imageData.includes('/')) {
            // res contained no data for the image, stop execution
            setStatus('request', 'invalid image', 'error')
            return
        }

        let imageItemElem = (index < imageItemElements.length ? imageItemElements[index] : null)
        if(!imageItemElem) {
            imageItemElem = document.createElement('div')
            imageItemElem.className = 'imgItem'
            imageItemElem.innerHTML = `
                <div class="imgContainer">
                    <img/>
                    <div class="imgItemInfo">
                        <span class="imgSeedLabel"></span>
                    </div>
                </div>
            `
            outputContainer.appendChild(imageItemElem)
        }
        const imageElem = imageItemElem.querySelector('img')
        imageElem.src = imageData
        imageElem.width = parseInt(imageWidth)
        imageElem.height = parseInt(imageHeight)
        imageElem.setAttribute('data-prompt', imagePrompt)
        imageElem.setAttribute('data-steps', imageInferenceSteps)
        imageElem.setAttribute('data-guidance', imageGuidanceScale)

        const imageInfo = imageItemElem.querySelector('.imgItemInfo')
        imageInfo.style.visibility = (livePreview ? 'hidden' : 'visible')

        if ('seed' in result && !imageElem.hasAttribute('data-seed')) {
            const req = Object.assign({}, reqBody, {
                seed: result?.seed || reqBody.seed
            })
            imageElem.setAttribute('data-seed', req.seed)
            const imageSeedLabel = imageItemElem.querySelector('.imgSeedLabel')
            imageSeedLabel.innerText = 'Seed: ' + req.seed

            let buttons = [
                { text: 'Use as Input', on_click: onUseAsInputClick },
                { text: 'Download', on_click: onDownloadImageClick },
                { text: 'Make Similar Images', on_click: onMakeSimilarClick },
                { text: 'Draw another 25 steps', on_click: onContinueDrawingClick },
                { text: 'Upscale', on_click: onUpscaleClick, filter: (req, img) => !req.use_upscale },
                { text: 'Fix Faces', on_click: onFixFacesClick, filter: (req, img) => !req.use_face_correction }
            ]

            // include the plugins
            buttons = buttons.concat(PLUGINS['IMAGE_INFO_BUTTONS'])

            const imgItemInfo = imageItemElem.querySelector('.imgItemInfo')
            const img = imageItemElem.querySelector('img')
            const createButton = function(btnInfo) {
                const newButton = document.createElement('button')
                newButton.classList.add('tasksBtns')
                newButton.innerText = btnInfo.text
                newButton.addEventListener('click', function() {
                    btnInfo.on_click(req, img)
                })
                imgItemInfo.appendChild(newButton)
            }
            buttons.forEach(btn => {
                if (btn.filter && btn.filter(req, img) === false) {
                    return
                }

                createButton(btn)
            })
        }
    })
}

function onUseAsInputClick(req, img) {
    const imgData = img.src

    initImageSelector.value = null
    initImagePreview.src = imgData
    imageEditor.setImage(imgData)

    maskSetting.checked = false
    imageInpainter.setImage(null)

    promptStrengthContainer.style.display = 'table-row'
}

function onDownloadImageClick(req, img) {
    const imgData = img.src
    const imageSeed = img.getAttribute('data-seed')
    const imagePrompt = img.getAttribute('data-prompt')
    const imageInferenceSteps = img.getAttribute('data-steps')
    const imageGuidanceScale = img.getAttribute('data-guidance')

    const imgDownload = document.createElement('a')
    imgDownload.download = createFileName(imagePrompt, imageSeed, imageInferenceSteps, imageGuidanceScale, req['output_format'])
    imgDownload.href = imgData
    imgDownload.click()
}

function modifyCurrentRequest(...reqDiff) {
    const newTaskRequest = getCurrentUserRequest()

    newTaskRequest.reqBody = Object.assign(newTaskRequest.reqBody, ...reqDiff, {
        use_cpu: useCPUField.checked
    })
    newTaskRequest.seed = newTaskRequest.reqBody.seed

    return newTaskRequest
}

function onMakeSimilarClick(req, img) {
    const newTaskRequest = modifyCurrentRequest(req, {
        num_outputs: 1,
        num_inference_steps: 50,
        guidance_scale: 7.5,
        prompt_strength: 0.7,
        init_image: img.src,
        seed: Math.floor(Math.random() * 10000000)
    })

    newTaskRequest.numOutputsTotal = 5
    newTaskRequest.batchCount = 5

    delete newTaskRequest.reqBody.mask

    createTask(newTaskRequest)
}

function enqueueImageVariationTask(req, img, reqDiff) {
    const imageSeed = img.getAttribute('data-seed')

    const newRequestBody = {
        num_outputs: 1, // this can be user-configurable in the future
        seed: imageSeed
    }

    // If the user is editing pictures, stop modifyCurrentRequest from importing
    // new values by setting the missing properties to undefined
    if (!('init_image' in req) && !('init_image' in reqDiff)) {
        newRequestBody.init_image = undefined
        newRequestBody.mask = undefined
    } else if (!('mask' in req) && !('mask' in reqDiff)) {
        newRequestBody.mask = undefined
    }

    const newTaskRequest = modifyCurrentRequest(req, reqDiff, newRequestBody)
    newTaskRequest.numOutputsTotal = 1 // this can be user-configurable in the future
    newTaskRequest.batchCount = 1

    createTask(newTaskRequest)
}

function onUpscaleClick(req, img) {
    enqueueImageVariationTask(req, img, {
        use_upscale: upscaleModelField.value
    })
}

function onFixFacesClick(req, img) {
    enqueueImageVariationTask(req, img, {
        use_face_correction: 'GFPGANv1.3'
    })
}

function onContinueDrawingClick(req, img) {
    enqueueImageVariationTask(req, img, {
        num_inference_steps: parseInt(req.num_inference_steps) + 25
    })
}

function getUncompletedTaskEntries() {
    const taskEntries = Array.from(
        document.querySelectorAll('#preview .imageTaskContainer .taskStatusLabel')
        ).filter((taskLabel) => taskLabel.style.display !== 'none'
        ).map(function(taskLabel) {
            let imageTaskContainer = taskLabel.parentNode
            while(!imageTaskContainer.classList.contains('imageTaskContainer') && imageTaskContainer.parentNode) {
                imageTaskContainer = imageTaskContainer.parentNode
            }
            return imageTaskContainer
        })
    if (!processOrder.checked) {
        taskEntries.reverse()
    }
    return taskEntries
}

function makeImage() {
    if (!SD.isServerAvailable()) {
        alert('The server is not available.')
        return
    }
    if (!randomSeedField.checked && seedField.value == '') {
        alert('The "Seed" field must not be empty.')
        return
    }
    if (numInferenceStepsField.value == '') {
        alert('The "Inference Steps" field must not be empty.')
        return
    }
    if (numOutputsTotalField.value == '') {
        numOutputsTotalField.value = 1
    }
    if (numOutputsParallelField.value == '') {
        numOutputsParallelField.value = 1
    }
    if (guidanceScaleField.value == '') {
        guidanceScaleField.value = guidanceScaleSlider.value / 10
    }

    const taskTemplate = getCurrentUserRequest()
    const newTaskRequests = getPrompts().map((prompt) => Object.assign({}, taskTemplate, {
        reqBody: Object.assign({ prompt: prompt }, taskTemplate.reqBody)
    }))
    newTaskRequests.forEach(createTask)

    initialText.style.display = 'none'
}

function onIdle() {
    const serverCapacity = SD.serverCapacity
    for (const taskEntry of getUncompletedTaskEntries()) {
        if (SD.activeTasks.size >= serverCapacity) {
            break
        }
        const task = htmlTaskMap.get(taskEntry)
        if (!task) {
            const taskStatusLabel = taskEntry.querySelector('.taskStatusLabel')
            taskStatusLabel.style.display = 'none'
            continue
        }
        onTaskStart(task)
    }
}

function getTaskUpdater(task, reqBody, outputContainer) {
    const outputMsg = task['outputMsg']
    const progressBar = task['progressBar']
    const progressBarInner = progressBar.querySelector("div")

    const batchCount = task.batchCount
    let lastStatus = undefined
    return async function(event) {
        if (this.status !== lastStatus) {
            lastStatus = this.status
            switch(this.status) {
                case SD.TaskStatus.pending:
                    task['taskStatusLabel'].innerText = "Pending"
                    task['taskStatusLabel'].classList.add('waitingTaskLabel')
                    break
                case SD.TaskStatus.waiting:
                    task['taskStatusLabel'].innerText = "Waiting"
                    task['taskStatusLabel'].classList.add('waitingTaskLabel')
                    task['taskStatusLabel'].classList.remove('activeTaskLabel')
                    break
                case SD.TaskStatus.processing:
                case SD.TaskStatus.completed:
                    task['taskStatusLabel'].innerText = "Processing"
                    task['taskStatusLabel'].classList.add('activeTaskLabel')
                    task['taskStatusLabel'].classList.remove('waitingTaskLabel')
                    break
                case SD.TaskStatus.stopped:
                    break
                case SD.TaskStatus.failed:
                    if (!SD.isServerAvailable()) {
                        logError("Stable Diffusion is still starting up, please wait. If this goes on beyond a few minutes, Stable Diffusion has probably crashed. Please check the error message in the command-line window.", event, outputMsg)
                    } else if (typeof event?.response === 'object') {
                        let msg = 'Stable Diffusion had an error reading the response:<br/><pre>'
                        if (this.exception) {
                            msg += `Error: ${this.exception.message}<br/>`
                        }
                        try { // 'Response': body stream already read
                            msg += 'Read: ' + await event.response.text()
                        } catch(e) {
                            msg += 'Unexpected end of stream. '
                        }
                        const bufferString = event.reader.bufferedString
                        if (bufferString) {
                            msg += 'Buffered data: ' + bufferString
                        }
                        msg += '</pre>'
                        logError(msg, event, outputMsg)
                    } else {
                        let msg = `Unexpected Read Error:<br/><pre>Error:${this.exception}<br/>EventInfo: ${JSON.stringify(event, undefined, 4)}</pre>`
                        logError(msg, event, outputMsg)
                    }
                    break
            }
        }
        if ('update' in event) {
            const stepUpdate = event.update
            if (!('step' in stepUpdate)) {
                return
            }
            // task.instances can be a mix of different tasks with uneven number of steps (Render Vs Filter Tasks)
            const overallStepCount = task.instances.reduce(
                (sum, instance) => sum + (instance.isPending ? Math.max(0, instance.step || stepUpdate.step) / (instance.total_steps || stepUpdate.total_steps) : 1),
                0 // Initial value
            ) * stepUpdate.total_steps // Scale to current number of steps.
            const totalSteps = task.instances.reduce(
                (sum, instance) => sum + (instance.total_steps || stepUpdate.total_steps),
                stepUpdate.total_steps * (batchCount - task.batchesDone) // Initial value at (unstarted task count * Nbr of steps)
            )
            const percent = Math.min(100, 100 * (overallStepCount / totalSteps)).toFixed(0)

            const timeTaken = stepUpdate.step_time // sec
            const stepsRemaining = Math.max(0, totalSteps - overallStepCount)
            const timeRemaining = (timeTaken < 0 ? '' : millisecondsToStr(stepsRemaining * timeTaken * 1000))
            outputMsg.innerHTML = `Batch ${task.batchesDone} of ${batchCount}. Generating image(s): ${percent}%. Time remaining (approx): ${timeRemaining}`
            outputMsg.style.display = 'block'
            progressBarInner.style.width = `${percent}%`

            if (stepUpdate.output) {
                showImages(reqBody, stepUpdate, outputContainer, true)
            }
        }
    }
}

function abortTask(task) {
    if (!task.isProcessing) {
        return false
    }
    task.isProcessing = false
    task.progressBar.classList.remove("active")
    task['taskStatusLabel'].style.display = 'none'
    task['stopTask'].innerHTML = '<i class="fa-solid fa-trash-can"></i> Remove'
    if (!task.instances?.some((r) => r.isPending)) {
        return
    }
    task.instances.forEach((instance) => {
        try {
            instance.abort()
        } catch (e) {
            console.error(e)
        }
    })
}

function onTaskErrorHandler(task, reqBody, instance, reason) {
    if (!task.isProcessing) {
        return
    }
    console.log('Render request %o, Instance: %o, Error: %s', reqBody, instance, reason)
    abortTask(task)
    const outputMsg = task['outputMsg']
    logError('Stable Diffusion had an error. Please check the logs in the command-line window. <br/><br/>' + reason + '<br/><pre>' + reason.stack + '</pre>', task, outputMsg)
    setStatus('request', 'error', 'error')
}

function onTaskCompleted(task, reqBody, instance, outputContainer, stepUpdate) {
    if (typeof stepUpdate !== 'object') {
        return
    }
    if (stepUpdate.status !== 'succeeded') {
        const outputMsg = task['outputMsg']
        let msg = ''
        if ('detail' in stepUpdate && typeof stepUpdate.detail === 'string' && stepUpdate.detail.length > 0) {
            msg = stepUpdate.detail
            if (msg.toLowerCase().includes('out of memory')) {
                msg += `<br/><br/>
                        <b>Suggestions</b>:
                        <br/>
                        1. If you have set an initial image, please try reducing its dimension to ${MAX_INIT_IMAGE_DIMENSION}x${MAX_INIT_IMAGE_DIMENSION} or smaller.<br/>
                        2. Try disabling the '<em>Turbo mode</em>' under '<em>Advanced Settings</em>'.<br/>
                        3. Try generating a smaller image.<br/>`
            }
        } else {
            msg = `Unexpected Read Error:<br/><pre>StepUpdate: ${JSON.stringify(stepUpdate, undefined, 4)}</pre>`
        }
        logError(msg, stepUpdate, outputMsg)
        return false
    }
    showImages(reqBody, stepUpdate, outputContainer, false)
    if (task.isProcessing && task.batchesDone < task.batchCount) {
        task['taskStatusLabel'].innerText = "Pending"
        task['taskStatusLabel'].classList.add('waitingTaskLabel')
        task['taskStatusLabel'].classList.remove('activeTaskLabel')
        return
    }
    if ('instances' in task && task.instances.some((ins) => ins != instance && ins.isPending)) {
        return
    }

    setStatus('request', 'done', 'success')

    task.isProcessing = false
    task['stopTask'].innerHTML = '<i class="fa-solid fa-trash-can"></i> Remove'
    task['taskStatusLabel'].style.display = 'none'

    let time = Date.now() - task.startTime
    time /= 1000

    if (task.batchesDone == task.batchCount) {
        task.outputMsg.innerText = `Processed ${task.numOutputsTotal} images in ${time} seconds`
        task.progressBar.style.height = "0px"
        task.progressBar.style.border = "0px solid var(--background-color3)"
        task.progressBar.classList.remove("active")
        setStatus('request', 'done', 'success')
    } else {
        task.outputMsg.innerText += `Task ended after ${time} seconds`
    }

    if (randomSeedField.checked) {
        seedField.value = task.seed
    }

    if (SD.activeTasks.size > 0) {
        return
    }
    const uncompletedTasks = getUncompletedTaskEntries()
    if (uncompletedTasks && uncompletedTasks.length > 0) {
        return
    }

    stopImageBtn.style.display = 'none'
    renameMakeImageButton()

    if (isSoundEnabled()) {
        playSound()
    }
}

function onTaskStart(task) {
    if (!task.isProcessing || task.batchesDone >= task.batchCount) {
        return
    }

    if (typeof task.startTime !== 'number') {
        task.startTime = Date.now()
    }
    if (!('instances' in task)) {
        task['instances'] = []
    }

    task['stopTask'].innerHTML = '<i class="fa-solid fa-circle-stop"></i> Stop'
    task['taskStatusLabel'].innerText = "Starting"
    task['taskStatusLabel'].classList.add('waitingTaskLabel')

    let newTaskReqBody = task.reqBody
    if (task.batchCount > 1) {
        // Each output render batch needs it's own task reqBody instance to avoid altering the other runs after they are completed.
        newTaskReqBody = Object.assign({}, task.reqBody)
    }

    const startSeed = task.seed || newTaskReqBody.seed
    const genSeeds = Boolean(typeof newTaskReqBody.seed !== 'number' || (newTaskReqBody.seed === task.seed && task.numOutputsTotal > 1))
    if (genSeeds) {
        newTaskReqBody.seed = parseInt(startSeed) + (task.batchesDone * newTaskReqBody.num_outputs)
    }

    // Update the seed *before* starting the processing so it's retained if user stops the task
    if (randomSeedField.checked) {
        seedField.value = task.seed
    }

    const outputContainer = document.createElement('div')
    outputContainer.className = 'img-batch'
    task.outputContainer.insertBefore(outputContainer, task.outputContainer.firstChild)

    const eventInfo = {reqBody:newTaskReqBody}
    PLUGINS['TASK_CREATE'].forEach((hook) => {
        if (typeof hook !== 'function') {
            console.error('The provided TASK_CREATE hook is not a function. Hook: %o', hook)
            return
        }
        try {
            hook.call(task, eventInfo)
        } catch (err) {
            console.error(err)
        }
    })
    let instance = eventInfo.instance
    if (!instance) {
        const factory = PLUGINS.OUTPUTS_FORMATS.get(newTaskReqBody.output_format)
        if (factory) {
            instance = factory(newTaskReqBody)
        }
        if (!instance) {
            console.error(`${factory ? "Factory " + String(factory) : 'No factory defined'} for ouput format ${newTaskReqBody.output_format}. Instance is ${instance || 'undefined'}. Using default renderer.`)
            instance = new SD.RenderTask(newTaskReqBody)
        }
    }

    task['instances'].push(instance)
    task.batchesDone++

    instance.enqueue(getTaskUpdater(task, newTaskReqBody, outputContainer)).then(
        (renderResult) => {
            onTaskCompleted(task, newTaskReqBody, instance, outputContainer, renderResult)
        },
        (reason) => {
            onTaskErrorHandler(task, newTaskReqBody, instance, reason)
        }
    )

    setStatus('request', 'fetching..')
    stopImageBtn.style.display = 'block'
    renameMakeImageButton()
    previewTools.style.display = 'block'
}

function createTask(task) {
    let taskConfig = `<b>Seed:</b> ${task.seed}, <b>Sampler:</b> ${task.reqBody.sampler}, <b>Inference Steps:</b> ${task.reqBody.num_inference_steps}, <b>Guidance Scale:</b> ${task.reqBody.guidance_scale}, <b>Model:</b> ${task.reqBody.use_stable_diffusion_model}`
    if (task.reqBody.use_vae_model.trim() !== '') {
        taskConfig += `, <b>VAE:</b> ${task.reqBody.use_vae_model}`
    }
    if (task.reqBody.negative_prompt.trim() !== '') {
        taskConfig += `, <b>Negative Prompt:</b> ${task.reqBody.negative_prompt}`
    }
    if (task.reqBody.init_image !== undefined) {
        taskConfig += `, <b>Prompt Strength:</b> ${task.reqBody.prompt_strength}`
    }
    if (task.reqBody.use_face_correction) {
        taskConfig += `, <b>Fix Faces:</b> ${task.reqBody.use_face_correction}`
    }
    if (task.reqBody.use_upscale) {
        taskConfig += `, <b>Upscale:</b> ${task.reqBody.use_upscale}`
    }

    let taskEntry = document.createElement('div')
    taskEntry.id = `imageTaskContainer-${Date.now()}`
    taskEntry.className = 'imageTaskContainer'
    taskEntry.innerHTML = ` <div class="header-content panel collapsible active">
                                <div class="taskStatusLabel">Enqueued</div>
                                <button class="secondaryButton stopTask"><i class="fa-solid fa-trash-can"></i> Remove</button>
                                <button class="secondaryButton useSettings"><i class="fa-solid fa-redo"></i> Use these settings</button>
                                <div class="preview-prompt collapsible active"></div>
                                <div class="taskConfig">${taskConfig}</div>
                                <div class="outputMsg"></div>
                                <div class="progress-bar active"><div></div></div>
                            </div>
                            <div class="collapsible-content">
                                <div class="img-preview">
                            </div>`

    createCollapsibles(taskEntry)

    task['taskStatusLabel'] = taskEntry.querySelector('.taskStatusLabel')
    task['outputContainer'] = taskEntry.querySelector('.img-preview')
    task['outputMsg'] = taskEntry.querySelector('.outputMsg')
    task['previewPrompt'] = taskEntry.querySelector('.preview-prompt')
    task['progressBar'] = taskEntry.querySelector('.progress-bar')
    task['stopTask'] = taskEntry.querySelector('.stopTask')

    task['stopTask'].addEventListener('click', (e) => {
        let question = (task['isProcessing'] ? "Stop this task?" : "Remove this task?")
        shiftOrConfirm(e, question, async function(e) {
            if (task.batchesDone <= 0 || !task.isProcessing) {
                taskEntry.remove()
            }
            abortTask(task)
        })
    })

    task['useSettings'] = taskEntry.querySelector('.useSettings')
    task['useSettings'].addEventListener('click', function(e) {
        e.stopPropagation()
        restoreTaskToUI(task, TASK_REQ_NO_EXPORT)
    })

    task.isProcessing = true
    taskEntry = imagePreview.insertBefore(taskEntry, previewTools.nextSibling)
    taskEntry.draggable = true
    htmlTaskMap.set(taskEntry, task)
    taskEntry.addEventListener('dragstart', function(ev) {
        ev.dataTransfer.setData("text/plain", ev.target.id);
    })

    task.previewPrompt.innerText = task.reqBody.prompt
    if (task.previewPrompt.innerText.trim() === '') {
        task.previewPrompt.innerHTML = '&nbsp;' // allows the results to be collapsed
    }

    // Allow prompt text to be selected.
    task.previewPrompt.addEventListener("mouseover", function() {
        taskEntry.setAttribute("draggable", "false");
    });
    task.previewPrompt.addEventListener("mouseout", function() {
        taskEntry.setAttribute("draggable", "true");
    });
}

function getCurrentUserRequest() {
    const numOutputsTotal = parseInt(numOutputsTotalField.value)
    const numOutputsParallel = parseInt(numOutputsParallelField.value)
    const seed = (randomSeedField.checked ? Math.floor(Math.random() * 10000000) : parseInt(seedField.value))

    const newTask = {
        batchesDone: 0,
        numOutputsTotal: numOutputsTotal,
        batchCount: Math.ceil(numOutputsTotal / numOutputsParallel),
        seed,

        reqBody: {
            seed,
            negative_prompt: negativePromptField.value.trim(),
            num_outputs: numOutputsParallel,
            num_inference_steps: parseInt(numInferenceStepsField.value),
            guidance_scale: parseFloat(guidanceScaleField.value),
            width: parseInt(widthField.value),
            height: parseInt(heightField.value),
            // allow_nsfw: allowNSFWField.checked,
            turbo: turboField.checked,
            //render_device: undefined, // Set device affinity. Prefer this device, but wont activate.
            use_full_precision: useFullPrecisionField.checked,
            use_stable_diffusion_model: stableDiffusionModelField.value,
            use_vae_model: vaeModelField.value,
            stream_progress_updates: true,
            stream_image_progress: (numOutputsTotal > 50 ? false : streamImageProgressField.checked),
            show_only_filtered_image: showOnlyFilteredImageField.checked,
            output_format: outputFormatField.value,
            output_quality: outputQualityField.value,
            original_prompt: promptField.value,
            active_tags: (activeTags.map(x => x.name))
        }
    }
    if (IMAGE_REGEX.test(initImagePreview.src)) {
        newTask.reqBody.init_image = initImagePreview.src
        newTask.reqBody.prompt_strength = parseFloat(promptStrengthField.value)

        // if (IMAGE_REGEX.test(maskImagePreview.src)) {
        //     newTask.reqBody.mask = maskImagePreview.src
        // }
        if (maskSetting.checked) {
            newTask.reqBody.mask = imageInpainter.getImg()
        }
        newTask.reqBody.sampler = 'ddim'
    } else {
        newTask.reqBody.sampler = samplerField.value
    }
    if (saveToDiskField.checked && diskPathField.value.trim() !== '') {
        newTask.reqBody.save_to_disk_path = diskPathField.value.trim()
    }
    if (useFaceCorrectionField.checked) {
        newTask.reqBody.use_face_correction = 'GFPGANv1.3'
    }
    if (useUpscalingField.checked) {
        newTask.reqBody.use_upscale = upscaleModelField.value
    }
    return newTask
}

function getPrompts(prompts) {
    if (typeof prompts === 'undefined') {
        prompts = promptField.value
    }
    if (prompts.trim() === '') {
        return ['']
    }

    prompts = prompts.split('\n')
    prompts = prompts.map(prompt => prompt.trim())
    prompts = prompts.filter(prompt => prompt !== '')

    const newTags = activeTags.filter(tag => tag.inactive === undefined || tag.inactive === false)
    if (newTags.length > 0) {
        const promptTags = newTags.map(x => x.name).join(", ")
        prompts = prompts.map((prompt) => `${prompt}, ${promptTags}`)
    }

    let promptsToMake = applySetOperator(prompts)
    promptsToMake = applyPermuteOperator(promptsToMake)

    return promptsToMake
}

function applySetOperator(prompts) {
    let promptsToMake = []
    let braceExpander = new BraceExpander()
    prompts.forEach(prompt => {
        let expandedPrompts = braceExpander.expand(prompt)
        promptsToMake = promptsToMake.concat(expandedPrompts)
    })

    return promptsToMake
}

function applyPermuteOperator(prompts) {
    let promptsToMake = []
    prompts.forEach(prompt => {
        let promptMatrix = prompt.split('|')
        prompt = promptMatrix.shift().trim()
        promptsToMake.push(prompt)

        promptMatrix = promptMatrix.map(p => p.trim())
        promptMatrix = promptMatrix.filter(p => p !== '')

        if (promptMatrix.length > 0) {
            let promptPermutations = permutePrompts(prompt, promptMatrix)
            promptsToMake = promptsToMake.concat(promptPermutations)
        }
    })

    return promptsToMake
}

function permutePrompts(promptBase, promptMatrix) {
    let prompts = []
    let permutations = permute(promptMatrix)
    permutations.forEach(perm => {
        let prompt = promptBase

        if (perm.length > 0) {
            let promptAddition = perm.join(', ')
            if (promptAddition.trim() === '') {
                return
            }

            prompt += ', ' + promptAddition
        }

        prompts.push(prompt)
    })

    return prompts
}

// create a file name with embedded prompt and metadata
// for easier cateloging and comparison
function createFileName(prompt, seed, steps, guidance, outputFormat) {

    // Most important information is the prompt
    let underscoreName = prompt.replace(/[^a-zA-Z0-9]/g, '_')
    underscoreName = underscoreName.substring(0, 100)
    //const steps = numInferenceStepsField.value
    //const guidance =  guidanceScaleField.value

    // name and the top level metadata
    let fileName = `${underscoreName}_Seed-${seed}_Steps-${steps}_Guidance-${guidance}`

    // add the tags
    // let tags = []
    // let tagString = ''
    // document.querySelectorAll(modifyTagsSelector).forEach(function(tag) {
    //     tags.push(tag.innerHTML)
    // })

    // join the tags with a pipe
    // if (activeTags.length > 0) {
    //     tagString = '_Tags-'
    //     tagString += tags.join('|')
    // }

    // // append empty or populated tags
    // fileName += `${tagString}`

    // add the file extension
    fileName += '.' + (outputFormat === 'png' ? 'png' : 'jpeg')

    return fileName
}

async function stopAllTasks() {
    getUncompletedTaskEntries().forEach((taskEntry) => {
        const taskStatusLabel = taskEntry.querySelector('.taskStatusLabel')
        if (taskStatusLabel) {
            taskStatusLabel.style.display = 'none'
        }
        const task = htmlTaskMap.get(taskEntry)
        if (!task) {
            return
        }
        abortTask(task)
    })
}

function removeTask(taskToRemove) {
    taskToRemove.remove()

    if (document.querySelector('.imageTaskContainer') === null) {
        previewTools.style.display = 'none'
        initialText.style.display = 'block'
    }
}

clearAllPreviewsBtn.addEventListener('click', (e) => { shiftOrConfirm(e, "Clear all the results and tasks in this window?", async function() {
    await stopAllTasks()

    let taskEntries = document.querySelectorAll('.imageTaskContainer')
    taskEntries.forEach(removeTask)
})})

stopImageBtn.addEventListener('click', (e) => { shiftOrConfirm(e, "Stop all the tasks?", async function(e) {
    await stopAllTasks()
})})

widthField.addEventListener('change', onDimensionChange)
heightField.addEventListener('change', onDimensionChange)

function renameMakeImageButton() {
    let totalImages = Math.max(parseInt(numOutputsTotalField.value), parseInt(numOutputsParallelField.value))
    let imageLabel = 'Image'
    if (totalImages > 1) {
        imageLabel = totalImages + ' Images'
    }
    if (SD.activeTasks.size == 0) {
        makeImageBtn.innerText = 'Make ' + imageLabel
    } else {
        makeImageBtn.innerText = 'Enqueue Next ' + imageLabel
    }
}
numOutputsTotalField.addEventListener('change', renameMakeImageButton)
numOutputsParallelField.addEventListener('change', renameMakeImageButton)

function onDimensionChange() {
    let widthValue = parseInt(widthField.value)
    let heightValue = parseInt(heightField.value)
    if (initImagePreviewContainer.classList.contains("has-image")) {
        imageInpainter.setImage(initImagePreview.src, widthValue, heightValue)
    } else {
        imageEditor.setImage(null, widthValue, heightValue)
    }
}

diskPathField.disabled = !saveToDiskField.checked

upscaleModelField.disabled = !useUpscalingField.checked
useUpscalingField.addEventListener('change', function(e) {
    upscaleModelField.disabled = !this.checked
})

makeImageBtn.addEventListener('click', makeImage)

document.onkeydown = function(e) {
    if (e.ctrlKey && e.code === 'Enter') {
        makeImage()
        e.preventDefault()
    }
}

/********************* Guidance **************************/
function updateGuidanceScale() {
    guidanceScaleField.value = guidanceScaleSlider.value / 10
    guidanceScaleField.dispatchEvent(new Event("change"))
}

function updateGuidanceScaleSlider() {
    if (guidanceScaleField.value < 0) {
        guidanceScaleField.value = 0
    } else if (guidanceScaleField.value > 50) {
        guidanceScaleField.value = 50
    }

    guidanceScaleSlider.value = guidanceScaleField.value * 10
    guidanceScaleSlider.dispatchEvent(new Event("change"))
}

guidanceScaleSlider.addEventListener('input', updateGuidanceScale)
guidanceScaleField.addEventListener('input', updateGuidanceScaleSlider)
updateGuidanceScale()

/********************* Prompt Strength *******************/
function updatePromptStrength() {
    promptStrengthField.value = promptStrengthSlider.value / 100
    promptStrengthField.dispatchEvent(new Event("change"))
}

function updatePromptStrengthSlider() {
    if (promptStrengthField.value < 0) {
        promptStrengthField.value = 0
    } else if (promptStrengthField.value > 0.99) {
        promptStrengthField.value = 0.99
    }

    promptStrengthSlider.value = promptStrengthField.value * 100
    promptStrengthSlider.dispatchEvent(new Event("change"))
}

promptStrengthSlider.addEventListener('input', updatePromptStrength)
promptStrengthField.addEventListener('input', updatePromptStrengthSlider)
updatePromptStrength()

/********************* JPEG Quality **********************/
function updateOutputQuality() {
    outputQualityField.value =  0 | outputQualitySlider.value
    outputQualityField.dispatchEvent(new Event("change"))
}

function updateOutputQualitySlider() {
    if (outputQualityField.value < 10) {
        outputQualityField.value = 10
    } else if (outputQualityField.value > 95) {
        outputQualityField.value = 95
    }

    outputQualitySlider.value =  0 | outputQualityField.value
    outputQualitySlider.dispatchEvent(new Event("change"))
}

outputQualitySlider.addEventListener('input', updateOutputQuality)
outputQualityField.addEventListener('input', debounce(updateOutputQualitySlider))
updateOutputQuality()

outputFormatField.addEventListener('change', e => {
    if (outputFormatField.value == 'jpeg') {
        outputQualityRow.style.display='table-row'
    } else {
        outputQualityRow.style.display='none'
    }
})


async function getModels() {
    try {
        const sd_model_setting_key = "stable_diffusion_model"
        const vae_model_setting_key = "vae_model"
        const selectedSDModel = SETTINGS[sd_model_setting_key].value
        const selectedVaeModel = SETTINGS[vae_model_setting_key].value

        const models = await SD.getModels()
        const modelsOptions = models['options']
        if ( "scan-error" in models) {
            // let previewPane = document.getElementById('tab-content-wrapper')
            let previewPane = document.getElementById('preview')
            previewPane.style.background="red"
            previewPane.style.textAlign="center"
            previewPane.innerHTML = '<H1>🔥Malware alert!🔥</H1><h2>The file <i>' + models['scan-error'] + '</i> in your <tt>models/stable-diffusion</tt> folder is probably malware infected.</h2><h2>Please delete this file from the folder before proceeding!</h2>After deleting the file, reload this page.<br><br><button onClick="window.location.reload();">Reload Page</button>'
            makeImageBtn.disabled = true
        }

        const stableDiffusionOptions = modelsOptions['stable-diffusion']
        const vaeOptions = modelsOptions['vae']
        vaeOptions.unshift('') // add a None option

        function createModelOptions(modelField, selectedModel) {
            return function(modelName) {
                const modelOption = document.createElement('option')
                modelOption.value = modelName
                modelOption.innerText = modelName !== '' ? modelName : 'None'

                if (modelName === selectedModel) {
                    modelOption.selected = true
                }

                modelField.appendChild(modelOption)
            }
        }

        stableDiffusionOptions.forEach(createModelOptions(stableDiffusionModelField, selectedSDModel))
        vaeOptions.forEach(createModelOptions(vaeModelField, selectedVaeModel))

        // TODO: set default for model here too
        SETTINGS[sd_model_setting_key].default = stableDiffusionOptions[0]
        if (getSetting(sd_model_setting_key) == '' || SETTINGS[sd_model_setting_key].value == '') {
            setSetting(sd_model_setting_key, stableDiffusionOptions[0])
        }
    } catch (e) {
        console.log('get models error', e)
    }
}

function checkRandomSeed() {
    if (randomSeedField.checked) {
        seedField.disabled = true
        //seedField.value = "0" // This causes the seed to be lost if the user changes their mind after toggling the checkbox
    } else {
        seedField.disabled = false
    }
}
randomSeedField.addEventListener('input', checkRandomSeed)
checkRandomSeed()

function showInitImagePreview() {
    if (initImageSelector.files.length === 0) {
        promptStrengthContainer.style.display = 'none'
        return
    }

    let reader = new FileReader()
    let file = initImageSelector.files[0]

    reader.addEventListener('load', function(event) {
        initImagePreview.src = reader.result
    })

    if (file) {
        reader.readAsDataURL(file)
    }
}
initImageSelector.addEventListener('change', showInitImagePreview)
showInitImagePreview()

initImagePreview.addEventListener('load', function() {
    promptStrengthContainer.style.display = 'table-row'
    initImagePreviewContainer.classList.add("has-image")

    initImageSizeBox.textContent = initImagePreview.naturalWidth + " x " + initImagePreview.naturalHeight
    imageEditor.setImage(this.src, initImagePreview.naturalWidth, initImagePreview.naturalHeight)
    imageInpainter.setImage(this.src, parseInt(widthField.value), parseInt(heightField.value))
})

function clearInitialImage() {
    initImageSelector.value = null
    initImagePreview.src = ''
    maskSetting.checked = false

    promptStrengthContainer.style.display = 'none'
    initImagePreviewContainer.classList.remove("has-image")
    imageEditor.setImage(null, parseInt(widthField.value), parseInt(heightField.value))
}

initImageClearBtn.addEventListener('click', function() {
    clearInitialImage()
})

maskSetting.addEventListener('click', function() {
    onDimensionChange()
})

promptsFromFileBtn.addEventListener('click', function() {
    promptsFromFileSelector.click()
})

promptsFromFileSelector.addEventListener('change', function() {
    if (promptsFromFileSelector.files.length === 0) {
        return
    }

    let reader = new FileReader()
    let file = promptsFromFileSelector.files[0]

    reader.addEventListener('load', function() {
        promptField.value = reader.result
    })

    if (file) {
        reader.readAsText(file)
    }
})

/* setup popup handlers */
document.querySelectorAll('.popup').forEach(popup => {
    popup.addEventListener('click', event => {
        if (event.target == popup) {
            popup.classList.remove("active")
        }
    })
    const closeButton = popup.querySelector(".close-button")
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            popup.classList.remove("active")
        })
    }
})

const tabElements = []
function selectTab(tab_id) {
    let tabInfo = tabElements.find(t => t.tab.id == tab_id)
    if (!tabInfo.tab.classList.contains("active")) {
        tabElements.forEach(info => {
            if (info.tab.classList.contains("active")) {
                info.tab.classList.toggle("active")
                info.content.classList.toggle("active")
            }
        })
        tabInfo.tab.classList.toggle("active")
        tabInfo.content.classList.toggle("active")
    }
}
function linkTabContents(tab) {
    const name = tab.id.replace("tab-", "")
    const content = document.getElementById(`tab-content-${name}`)
    tabElements.push({
        name: name,
        tab: tab,
        content: content
    })

    tab.addEventListener("click", event => selectTab(tab.id))
}

document.querySelectorAll(".tab").forEach(linkTabContents)

window.addEventListener("beforeunload", function(e) {
    const msg = "Unsaved pictures will be lost!";

    let elementList = document.getElementsByClassName("imageTaskContainer");
    if (elementList.length != 0) {
        e.preventDefault();
        (e || window.event).returnValue = msg;
        return msg;
    } else {
        return true;
    }
});

createCollapsibles()
prettifyInputs(document);
