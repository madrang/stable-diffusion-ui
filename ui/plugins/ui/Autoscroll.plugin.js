(function () {
    "use strict"

    var styleSheet = document.createElement("style");
    styleSheet.textContent = `
        .auto-scroll {
            float: right;
        }
    `;
    document.head.appendChild(styleSheet);
    
    const autoScrollControl = document.createElement('div');
    autoScrollControl.innerHTML = `<input id="auto_scroll" name="auto_scroll" type="checkbox">
                            <label for="auto_scroll">Scroll to generated image</label>`
    autoScrollControl.className = "auto-scroll"
    clearAllPreviewsBtn.parentNode.insertBefore(autoScrollControl, clearAllPreviewsBtn.nextSibling)
    prettifyInputs(document);
    let autoScroll = document.querySelector("#auto_scroll")

    SETTINGS_IDS_LIST.push("auto_scroll")
    initSettings()

    // observe for changes in the preview pane
    var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            if (mutation.target.className == 'img-batch') {
                Autoscroll(mutation.target)
            }
        })
    })
    
    observer.observe(document.getElementById('preview'), {
            childList: true,
            subtree: true
    })

    function Autoscroll(target) {
        if (autoScroll.checked && target !== null) {
            target.parentElement.parentElement.parentElement.scrollIntoView();
        }
    }
})()
