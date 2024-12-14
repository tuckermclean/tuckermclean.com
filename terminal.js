const terminal = document.getElementById('terminal');
const terminalHeader = document.getElementById('terminal-header');
const terminalIcon = document.getElementById('terminal-icon');
const closeBtn = document.querySelector('.close');
const minimizeBtn = document.querySelector('.minimize');
const maximizeBtn = document.querySelector('.maximize');

// Add event listeners for all buttons (close, minimize, maximize)
closeBtn.addEventListener('click', closeTerminal);
closeBtn.addEventListener('touchstart', closeTerminal, { passive: false });

minimizeBtn.addEventListener('click', minimizeTerminal);
minimizeBtn.addEventListener('touchstart', minimizeTerminal, { passive: false });

maximizeBtn.addEventListener('click', maximizeTerminal);
maximizeBtn.addEventListener('touchstart', maximizeTerminal, { passive: false });


// Dragging functionality
terminalHeader.addEventListener('mousedown', startDrag);
terminalHeader.addEventListener('touchstart', startDrag, { passive: false });

function startDrag(e) {
    // Prevent dragging when clicking on buttons
    if (e.target.closest('.button')) return;

    e.preventDefault();

    const isTouch = e.type === 'touchstart';
    const offsetX = (isTouch ? e.touches[0].clientX : e.clientX) - terminal.offsetLeft;
    const offsetY = (isTouch ? e.touches[0].clientY : e.clientY) - terminal.offsetTop;

    function onMove(event) {
        const clientX = isTouch ? event.touches[0].clientX : event.clientX;
        const clientY = isTouch ? event.touches[0].clientY : event.clientY;

        if (!terminal.classList.contains('minimized')) {
            // Prevent terminal header from leaving the viewport
            if (clientY > terminalHeader.getBoundingClientRect().height / 2) {
                terminal.style.top = `${clientY - offsetY}px`;
            }
            terminal.style.left = `${clientX - offsetX}px`;
        }
    }

    function stopDrag() {
        document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
        document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stopDrag);
    }

    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', stopDrag);
}


// Resizing functionality
const grippy = document.getElementById('grippy'); // Ensure the grippy is styled and functional
grippy.addEventListener('mousedown', startResize);
grippy.addEventListener('touchstart', startResize, { passive: false });

function startResize(e) {
    e.preventDefault();
    const isTouch = e.type === 'touchstart';
    const startWidth = terminal.offsetWidth;
    const startHeight = terminal.offsetHeight;
    const startX = isTouch ? e.touches[0].clientX : e.clientX;
    const startY = isTouch ? e.touches[0].clientY : e.clientY;

    function onResize(event) {
        const clientX = isTouch ? event.touches[0].clientX : event.clientX;
        const clientY = isTouch ? event.touches[0].clientY : event.clientY;

        terminal.style.width = `${startWidth + (clientX - startX)}px`;
        terminal.style.height = `${startHeight + (clientY - startY)}px`;
    }

    function stopResize() {
        document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onResize);
        document.removeEventListener(isTouch ? 'touchend' : 'mouseup', stopResize);
    }

    document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onResize, { passive: false });
    document.addEventListener(isTouch ? 'touchend' : 'mouseup', stopResize);
}


// // Drag functionality
// terminalHeader.addEventListener('mousedown', (e) => {
//     let offsetX = e.clientX - terminal.offsetLeft;
//     let offsetY = e.clientY - terminal.offsetTop;
    
//     function onMouseMove(event) {
//         if (!terminal.classList.contains('minimized')) {
//             // Prevent terminal header from going off screen on top
//             if (event.clientY > (terminalHeader.getBoundingClientRect().height / 2)) {
//                 terminal.style.top = `${event.clientY - offsetY}px`;
//             }
//             terminal.style.left = `${event.clientX - offsetX}px`;
//         }
//     }
    
//     document.addEventListener('mousemove', onMouseMove);
    
//     document.addEventListener('mouseup', () => {
//         document.removeEventListener('mousemove', onMouseMove);
//     }, { once: true });
// });

function closeTerminal() {
    terminal.classList.add('closed');
    terminalIcon.classList.remove('opened');
    terminal.classList.remove('minimized');
    terminal.classList.remove('maximized');
}

function minimizeTerminal() {
    const body = terminal.querySelector('.terminal-body');
    if (terminal.classList.contains('minimized')) {
        terminal.classList.remove('minimized');
    } else {
        terminal.classList.add('minimized');
    }
    terminal.classList.remove('maximized');
}

function maximizeTerminal() {
    if (terminal.classList.contains('maximized')) {
        // Restore previous state
        terminal.classList.remove('maximized');
    } else {
        // Maximize and adjust height
        terminal.classList.add('maximized');
    }
    terminal.classList.remove('minimized');
}

function openTerminal() {
    terminal.style = {};
    terminal.classList.remove('minimized');
    terminal.classList.remove('closed');
    terminalIcon.classList.add('opened');
}

function toggleMode() {
    document.body.classList.toggle('light-mode');
}

function loadHTML(url, targetElementId) {
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(html => {
            document.getElementById(targetElementId).innerHTML = html;
        })
        .catch(error => {
            console.error('Error loading HTML:', error);
        });
}

// Load the resume into the container
loadHTML('resume.html', 'resume-container');
