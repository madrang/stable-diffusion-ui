"use strict" // Opt in to a restricted variant of JavaScript
const MAX_INIT_IMAGE_DIMENSION = 768

const IMAGE_REGEX = new RegExp('data:image/[A-Za-z]+;base64')

let promptField = document.querySelector('#prompt')
let promptsFromFileSelector = document.querySelector('#prompt_from_file')
let promptsFromFileBtn = document.querySelector('#promptsFromFileBtn')
let negativePromptField = document.querySelector('#negative_prompt')
let numOutputsTotalField = document.querySelector('#num_outputs_total')
let numOutputsParallelField = document.querySelector('#num_outputs_parallel')
let numInferenceStepsField = document.querySelector('#num_inference_steps')
let guidanceScaleSlider = document.querySelector('#guidance_scale_slider')
let guidanceScaleField = document.querySelector('#guidance_scale')
let randomSeedField = document.querySelector("#random_seed")
let seedField = document.querySelector('#seed')
let widthField = document.querySelector('#width')
let heightField = document.querySelector('#height')
let initImageSelector = document.querySelector("#init_image")
let initImagePreview = document.querySelector("#init_image_preview")
let initImageSizeBox = document.querySelector("#init_image_size_box")
let maskImageSelector = document.querySelector("#mask")
let maskImagePreview = document.querySelector("#mask_preview")
let turboField = document.querySelector('#turbo')
let useCPUField = document.querySelector('#use_cpu')
let useFullPrecisionField = document.querySelector('#use_full_precision')
let saveToDiskField = document.querySelector('#save_to_disk')
let diskPathField = document.querySelector('#diskPath')
// let allowNSFWField = document.querySelector("#allow_nsfw")
let useBetaChannelField = document.querySelector("#use_beta_channel")
let promptStrengthSlider = document.querySelector('#prompt_strength_slider')
let promptStrengthField = document.querySelector('#prompt_strength')
let samplerField = document.querySelector('#sampler')
let samplerSelectionContainer = document.querySelector("#samplerSelection")
let useFaceCorrectionField = document.querySelector("#use_face_correction")
let useUpscalingField = document.querySelector("#use_upscale")
let upscaleModelField = document.querySelector("#upscale_model")
let stableDiffusionModelField = document.querySelector('#stable_diffusion_model')
let vaeModelField = document.querySelector('#default_vae_model')
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

// let maskSetting = document.querySelector('#editor-inputs-mask_setting')
// let maskImagePreviewContainer = document.querySelector('#mask_preview_container')
// let maskImageClearBtn = document.querySelector('#mask_clear')
let maskSetting = document.querySelector('#enable_mask')

let imagePreview = document.querySelector("#preview")

let showConfigToggle = document.querySelector('#configToggleBtn')
// let configBox = document.querySelector('#config')
// let outputMsg = document.querySelector('#outputMsg')

let soundToggle = document.querySelector('#sound_toggle')

let serverStatusColor = document.querySelector('#server-status-color')
let serverStatusMsg = document.querySelector('#server-status-msg')

document.querySelector('.drawing-board-control-navigation-back').innerHTML = '<i class="fa-solid fa-rotate-left"></i>'
document.querySelector('.drawing-board-control-navigation-forward').innerHTML = '<i class="fa-solid fa-rotate-right"></i>'

let maskResetButton = document.querySelector('.drawing-board-control-navigation-reset')
maskResetButton.innerHTML = 'Clear'
maskResetButton.style.fontWeight = 'normal'
maskResetButton.style.fontSize = '10pt'

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

function setServerStatus(msgType, msg) {
    switch(msgType) {
        case 'online':
            serverStatusColor.style.color = 'green'
            serverStatusMsg.style.color = 'green'
            serverStatusMsg.innerText = 'Stable Diffusion is ' + msg
            break
        case 'busy':
            serverStatusColor.style.color = 'rgb(200, 139, 0)'
            serverStatusMsg.style.color = 'rgb(200, 139, 0)'
            serverStatusMsg.innerText = 'Stable Diffusion is ' + msg
            break
        case 'error':
            serverStatusColor.style.color = 'red'
            serverStatusMsg.style.color = 'red'
            serverStatusMsg.innerText = 'Stable Diffusion has stopped'
            break
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
    var promise = audio.play()
    if (promise !== undefined) {
        promise.then(_ => {}).catch(error => {
            console.warn("browser blocked autoplay")
        })
    }
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

    initImagePreviewContainer.style.display = 'block'
    inpaintingEditorContainer.style.display = 'none'
    promptStrengthContainer.style.display = 'table-row'
    maskSetting.checked = false
    samplerSelectionContainer.style.display = 'none'
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

    const newTaskRequest = modifyCurrentRequest(req, reqDiff, {
        num_outputs: 1, // this can be user-configurable in the future
        seed: imageSeed
    })

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

// makes a single image. don't call this directly, use makeImage() instead
async function doMakeImage(task) {
    if (task.stopped) {
        return
    }
    try {
        if (typeof stepUpdate === 'object' && stepUpdate.status !== 'succeeded') {
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
        showImages(task.reqBody, stepUpdate, outputContainer, false)
    } catch (e) {
        console.log('request error', e)
        logError('Stable Diffusion had an error. Please check the logs in the command-line window. <br/><br/>' + e + '<br/><pre>' + e.stack + '</pre>', task, outputMsg)
        setStatus('request', 'error', 'error')
        return false
    }
    return true
}

function onTaskCompleted() {
    setStatus('request', 'done', 'success')
    stopImageBtn.style.display = 'none'
    renameMakeImageButton()

    if (SD.activeTasks.size <= 0 && isSoundEnabled()) {
        playSound()
    }
}

async function onTaskStart(task) {
    setStatus('request', 'fetching..')

    stopImageBtn.style.display = 'block'
    renameMakeImageButton()

    previewTools.style.display = 'block'

    let time = Date.now()
    let successCount = 0

    task.isProcessing = true
    task['stopTask'].innerHTML = '<i class="fa-solid fa-circle-stop"></i> Stop'
    task['taskStatusLabel'].innerText = "Starting"
    task['taskStatusLabel'].classList.add('waitingTaskLabel')

    const genSeeds = Boolean(typeof task.reqBody.seed !== 'number' || (task.reqBody.seed === task.seed && task.numOutputsTotal > 1))
    const startSeed = task.reqBody.seed || task.seed
    for (let i = 0; i < task.batchCount; i++) {
        let newTask = task
        if (task.batchCount > 1) {
            // Each output render batch needs it's own task instance to avoid altering the other runs after they are completed.
            newTask = Object.assign({}, task, {
                reqBody: Object.assign({}, task.reqBody)
            })
        }
        if (genSeeds) {
            newTask.reqBody.seed = parseInt(startSeed) + (i * newTask.reqBody.num_outputs)
            newTask.seed = newTask.reqBody.seed
        } else if (newTask.seed !== newTask.reqBody.seed) {
            newTask.seed = newTask.reqBody.seed
        }

        let success = await doMakeImage(newTask)
        task.batchesDone++

        if (!task.isProcessing || !success) {
            break
        }

        if (success) {
            successCount++
        }
    }

    task.isProcessing = false
    task['stopTask'].innerHTML = '<i class="fa-solid fa-trash-can"></i> Remove'
    task['taskStatusLabel'].style.display = 'none'

    time = Date.now() - time
    time /= 1000

    if (successCount === task.batchCount) {
        task.outputMsg.innerText = 'Processed ' + task.numOutputsTotal + ' images in ' + time + ' seconds'
        task.progressBar.style.height = "0px"
        task.progressBar.style.border = "0px solid var(--background-color3)"
        task.progressBar.classList.remove("active")
        // setStatus('request', 'done', 'success')
    } else {
        if (task.outputMsg.innerText.toLowerCase().indexOf('error') === -1) {
            task.outputMsg.innerText = 'Task ended after ' + time + ' seconds'
        }
    }

    if (randomSeedField.checked) {
        seedField.value = task.seed
    }
}

function getCurrentUserRequest() {
    const numOutputsTotal = parseInt(numOutputsTotalField.value)
    const numOutputsParallel = parseInt(numOutputsParallelField.value)
    const seed = (randomSeedField.checked ? Math.floor(Math.random() * 10000000) : parseInt(seedField.value))

    const newTask = {
        isProcessing: false,
        stopped: false,
        batchesDone: 0,
        numOutputsTotal: numOutputsTotal,
        batchCount: Math.ceil(numOutputsTotal / numOutputsParallel),
        seed,

        reqBody: {
            session_id: SD.sessionId,
            seed,
            negative_prompt: negativePromptField.value.trim(),
            num_outputs: numOutputsParallel,
            num_inference_steps: parseInt(numInferenceStepsField.value),
            guidance_scale: parseFloat(guidanceScaleField.value),
            width: parseInt(widthField.value),
            height: parseInt(heightField.value),
            // allow_nsfw: allowNSFWField.checked,
            turbo: turboField.checked,
            use_cpu: useCPUField.checked,
            use_full_precision: useFullPrecisionField.checked,
            use_stable_diffusion_model: stableDiffusionModelField.value,
            stream_progress_updates: true,
            stream_image_progress: (numOutputsTotal > 50 ? false : streamImageProgressField.checked),
            show_only_filtered_image: showOnlyFilteredImageField.checked,
            output_format: outputFormatField.value
        }
    }
    if (IMAGE_REGEX.test(initImagePreview.src)) {
        newTask.reqBody.init_image = initImagePreview.src
        newTask.reqBody.prompt_strength = parseFloat(promptStrengthField.value)

        // if (IMAGE_REGEX.test(maskImagePreview.src)) {
        //     newTask.reqBody.mask = maskImagePreview.src
        // }
        if (maskSetting.checked) {
            newTask.reqBody.mask = inpaintingEditor.getImg()
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

function makeImage() {
    if (!SD.isServerAvailable()) {
        alert('The server is not available.')
        return
    }
    const taskTemplate = getCurrentUserRequest()
    const newTaskRequests = []
    getPrompts().forEach((prompt) => newTaskRequests.push(Object.assign({}, taskTemplate, {
        reqBody: Object.assign({ prompt: prompt }, taskTemplate.reqBody)
    })))
    newTaskRequests.forEach(createTask)

    initialText.style.display = 'none'
}

function createTask(task) {
    let taskConfig = `Seed: ${task.seed}, Sampler: ${task.reqBody.sampler}, Inference Steps: ${task.reqBody.num_inference_steps}, Guidance Scale: ${task.reqBody.guidance_scale}, Model: ${task.reqBody.use_stable_diffusion_model}`
    if (negativePromptField.value.trim() !== '') {
        taskConfig += `, Negative Prompt: ${task.reqBody.negative_prompt}`
    }
    if (task.reqBody.init_image !== undefined) {
        taskConfig += `, Prompt Strength: ${task.reqBody.prompt_strength}`
    }
    if (task.reqBody.use_face_correction) {
        taskConfig += `, Fix Faces: ${task.reqBody.use_face_correction}`
    }
    if (task.reqBody.use_upscale) {
        taskConfig += `, Upscale: ${task.reqBody.use_upscale}`
    }

    let taskEntry = document.createElement('div')
    taskEntry.className = 'imageTaskContainer'
    taskEntry.innerHTML = ` <div class="taskStatusLabel">Enqueued</div>
                            <button class="secondaryButton stopTask"><i class="fa-solid fa-trash-can"></i> Remove</button>
                            <div class="preview-prompt collapsible active"></div>
                            <div class="taskConfig">${taskConfig}</div>
                            <div class="collapsible-content" style="display: block">
                                <div class="outputMsg"></div>
                                <div class="progress-bar active"><div></div></div>
                                <div class="img-preview">
                            </div>`

    createCollapsibles(taskEntry)

    task['taskStatusLabel'] = taskEntry.querySelector('.taskStatusLabel')
    task['outputContainer'] = taskEntry.querySelector('.img-preview')
    task['outputMsg'] = taskEntry.querySelector('.outputMsg')
    task['previewPrompt'] = taskEntry.querySelector('.preview-prompt')
    task['progressBar'] = taskEntry.querySelector('.progress-bar')
    task['stopTask'] = taskEntry.querySelector('.stopTask')

    task['stopTask'].addEventListener('click', async function() {
        if (task.isProcessing) {
            task.isProcessing = false
            task.progressBar.classList.remove("active")
            try {
                let res = await fetch('/image/stop?session_id=' + SD.sessionId)
            } catch (e) {
                console.log(e)
            }
        } else {
            task.instance.abort()
            taskEntry.remove()
        }
    })

    imagePreview.insertBefore(taskEntry, previewTools.nextSibling)

    task.previewPrompt.innerText = task.reqBody.prompt
    if (task.previewPrompt.innerText.trim() === '') {
        task.previewPrompt.innerHTML = '&nbsp;' // allows the results to be collapsed
    }

    const batchCount = task.batchCount
    const outputContainer = document.createElement('div')

    outputContainer.className = 'img-batch'
    task.outputContainer.insertBefore(outputContainer, task.outputContainer.firstChild)

    const outputMsg = task['outputMsg']
    const progressBar = task['progressBar']
    const progressBarInner = progressBar.querySelector("div")

    let lastStatus = undefined
    task['instance'] = new SD.RenderTask(task.reqBody)
    task.instance.enqueue(async function(event) {
        if ('update' in event) {
            const stepUpdate = event.update
            if (!('step' in stepUpdate)) {
                return
            }
            let batchSize = stepUpdate.total_steps
            let overallStepCount = stepUpdate.step + task.batchesDone * batchSize
            let totalSteps = batchCount * batchSize
            let percent = 100 * (overallStepCount / totalSteps)
            percent = (percent > 100 ? 100 : percent)
            percent = percent.toFixed(0)
            let timeTaken = stepUpdate.step_time // sec

            let stepsRemaining = totalSteps - overallStepCount
            stepsRemaining = (stepsRemaining < 0 ? 0 : stepsRemaining)
            let timeRemaining = (timeTaken === -1 ? '' : stepsRemaining * timeTaken * 1000) // ms

            outputMsg.innerHTML = `Batch ${task.batchesDone+1} of ${batchCount}`
            outputMsg.innerHTML += `. Generating image(s): ${percent}%`

            timeRemaining = (timeTaken !== -1 ? millisecondsToStr(timeRemaining) : '')
            outputMsg.innerHTML += `. Time remaining (approx): ${timeRemaining}`
            outputMsg.style.display = 'block'

            progressBarInner.style.width = `${percent}%`
            if (percent == 100) {
                task.progressBar.style.height = "0px"
                task.progressBar.style.border = "0px solid var(--background-color3)"
                task.progressBar.classList.remove("active")
            }

            if (stepUpdate.output) {
                showImages(task.reqBody, stepUpdate, outputContainer, true)
            }
        }
        if (this.status === lastStatus) {
            return
        }
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
                task['taskStatusLabel'].innerText = "Processing"
                task['taskStatusLabel'].classList.add('activeTaskLabel')
                task['taskStatusLabel'].classList.remove('waitingTaskLabel')
                break
            case SD.TaskStatus.stopped:
            case SD.TaskStatus.completed:
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
    }).then(function(renderResult) {
        showImages(task.reqBody, renderResult, outputContainer, false)
    })
}

function getPrompts() {
    let prompts = promptField.value
    if (prompts.trim() === '') {
        return ['']
    }

    prompts = prompts.split('\n')
    prompts = prompts.map(prompt => prompt.trim())
    prompts = prompts.filter(prompt => prompt !== '')

    let promptsToMake = applySetOperator(prompts)
    promptsToMake = applyPermuteOperator(promptsToMake)

    if (activeTags.length <= 0) {
        return promptsToMake
    }

    const promptTags = activeTags.map(x => x.name).join(", ")
    return promptsToMake.map((prompt) => `${prompt}, ${promptTags}`)
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
    SD.activeTasks.forEach(task => {
        task.isProcessing = false
        task.instance.abort()
    })

    try {
        let res = await fetch('/image/stop?session_id=' + SD.sessionId)
        console.log('Stop all response', res)
    } catch (e) {
        console.error(e)
    }
}

clearAllPreviewsBtn.addEventListener('click', async function() {
    await stopAllTasks()

    let taskEntries = document.querySelectorAll('.imageTaskContainer')
    taskEntries.forEach(task => {
        task.remove()
    })

    previewTools.style.display = 'none'
    initialText.style.display = 'block'
})

stopImageBtn.addEventListener('click', async function() {
    await stopAllTasks()
})

widthField.addEventListener('change', onDimensionChange)
heightField.addEventListener('change', onDimensionChange)

function renameMakeImageButton() {
    let totalImages = Math.max(parseInt(numOutputsTotalField.value), parseInt(numOutputsParallelField.value))
    let imageLabel = 'Image'
    if (totalImages > 1) {
        imageLabel = totalImages + ' Images'
    }
    if (SD.activeTasks.length == 0) {
        makeImageBtn.innerText = 'Make ' + imageLabel
    } else {
        makeImageBtn.innerText = 'Enqueue Next ' + imageLabel
    }
}
numOutputsTotalField.addEventListener('change', renameMakeImageButton)
numOutputsParallelField.addEventListener('change', renameMakeImageButton)

function onDimensionChange() {
    if (!maskSetting.checked) {
        return
    }
    let widthValue = parseInt(widthField.value)
    let heightValue = parseInt(heightField.value)

    resizeInpaintingEditor(widthValue, heightValue)
}

diskPathField.disabled = !saveToDiskField.checked
saveToDiskField.addEventListener('change', function(e) {
    diskPathField.disabled = !this.checked
})

upscaleModelField.disabled = !useUpscalingField.checked
useUpscalingField.addEventListener('change', function(e) {
    upscaleModelField.disabled = !this.checked
})

makeImageBtn.addEventListener('click', makeImage)


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

async function changeAppConfig(configDelta) {
    // if (!SD.isServerAvailable()) {
    //     // logError('The server is still starting up..')
    //     alert('The server is still starting up..')
    //     e.preventDefault()
    //     return false
    // }

    try {
        let res = await fetch('/app_config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(configDelta)
        })
        res = await res.json()

        console.log('set config status response', res)
    } catch (e) {
        console.log('set config status error', e)
    }
}

useBetaChannelField.addEventListener('click', async function(e) {
    let updateBranch = (this.checked ? 'beta' : 'main')

    await changeAppConfig({
        'update_branch': updateBranch
    })
})

vaeModelField.addEventListener('change', async function() {
    await changeAppConfig({
        'model_vae': this.value
    })
})

async function getAppConfig() {
    try {
        let res = await fetch('/get/app_config')
        const config = await res.json()

        if (config.update_branch === 'beta') {
            useBetaChannelField.checked = true
            updateBranchLabel.innerText = "(beta)"
        }

        console.log('get config status response', config)
    } catch (e) {
        console.log('get config status error', e)
    }
}

async function getModels() {
    try {
        var model_setting_key = "stable_diffusion_model"
        var selectedModel = SETTINGS[model_setting_key].value
        let res = await fetch('/get/models')
        const models = await res.json()

        let activeModels = models['active']
        let modelOptions = models['options']
        let stableDiffusionOptions = modelOptions['stable-diffusion']
        let vaeOptions = modelOptions['vae']
        let activeVae = activeModels['vae']

        function createModelOptions(modelField, selectedModel) {
            return function(modelName) {
                let modelOption = document.createElement('option')
                modelOption.value = modelName
                modelOption.innerText = modelName

                if (modelName === selectedModel) {
                    modelOption.selected = true
                }

                modelField.appendChild(modelOption)
            }
        }

        stableDiffusionOptions.forEach(createModelOptions(stableDiffusionModelField, selectedModel))
        vaeOptions.forEach(createModelOptions(vaeModelField, activeVae))

        // TODO: set default for model here too
        SETTINGS[model_setting_key].default = stableDiffusionOptions[0]
        if (getSetting(model_setting_key) == '' || SETTINGS[model_setting_key].value == '') {
            setSetting(model_setting_key, stableDiffusionOptions[0])
        }

        console.log('get models response', models)
    } catch (e) {
        console.log('get models error', e)
    }
}

function checkRandomSeed() {
    if (randomSeedField.checked) {
        seedField.disabled = true
        seedField.value = "0"
    } else {
        seedField.disabled = false
    }
}
randomSeedField.addEventListener('input', checkRandomSeed)
checkRandomSeed()

function showInitImagePreview() {
    if (initImageSelector.files.length === 0) {
        initImagePreviewContainer.style.display = 'none'
        // inpaintingEditorContainer.style.display = 'none'
        promptStrengthContainer.style.display = 'none'
        // maskSetting.style.display = 'none'
        return
    }

    let reader = new FileReader()
    let file = initImageSelector.files[0]

    reader.addEventListener('load', function(event) {
        // console.log(file.name, reader.result)
        initImagePreview.src = reader.result
        initImagePreviewContainer.style.display = 'block'
        inpaintingEditorContainer.style.display = 'none'
        promptStrengthContainer.style.display = 'table-row'
        samplerSelectionContainer.style.display = 'none'
        // maskSetting.checked = false
    })

    if (file) {
        reader.readAsDataURL(file)
    }
}
initImageSelector.addEventListener('change', showInitImagePreview)
showInitImagePreview()

initImagePreview.addEventListener('load', function() {
    inpaintingEditorCanvasBackground.style.backgroundImage = "url('" + this.src + "')"
    // maskSetting.style.display = 'block'
    // inpaintingEditorContainer.style.display = 'block'
    initImageSizeBox.textContent = initImagePreview.naturalWidth + " x " + initImagePreview.naturalHeight
    initImageSizeBox.style.display = 'block'
})

initImageClearBtn.addEventListener('click', function() {
    initImageSelector.value = null
    // maskImageSelector.value = null

    initImagePreview.src = ''
    // maskImagePreview.src = ''
    maskSetting.checked = false

    initImagePreviewContainer.style.display = 'none'
    // inpaintingEditorContainer.style.display = 'none'
    // maskImagePreviewContainer.style.display = 'none'

    // maskSetting.style.display = 'none'

    promptStrengthContainer.style.display = 'none'
    samplerSelectionContainer.style.display = 'table-row'
    initImageSizeBox.style.display = 'none'
})

maskSetting.addEventListener('click', function() {
    inpaintingEditorContainer.style.display = (this.checked ? 'block' : 'none')
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

async function getDiskPath() {
    try {
        var diskPath = getSetting("diskPath")
        if (diskPath == '' || diskPath == undefined || diskPath == "undefined") {
            let res = await fetch('/get/output_dir')
            if (res.status === 200) {
                res = await res.json()
                res = res.output_dir

                setSetting("diskPath", res)
            }
        }
    } catch (e) {
        console.log('error fetching output dir path', e)
    }
}


/* setup popup handlers */
document.querySelectorAll('.popup').forEach(popup => {
    popup.addEventListener('click', event => {
        if (event.target == popup) {
            popup.classList.remove("active")
        }
    })
    var closeButton = popup.querySelector(".close-button")
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            popup.classList.remove("active")
        })
    }
})

createCollapsibles()
