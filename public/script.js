// File Upload Handling
document.addEventListener('DOMContentLoaded', function() {
    // File upload feedback
    const fileInput = document.getElementById('resume');
    const fileNameSpan = document.getElementById('file-name');
    const uploadForm = document.getElementById('uploadForm');
    const submitBtn = document.getElementById('submit-btn');
    const progressBar = document.getElementById('upload-progress');
    
    if (fileInput) {
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            
            if (file) {
                fileNameSpan.textContent = file.name;
                
                // Validate file size
                if (file.size > 5 * 1024 * 1024) {
                    alert('File size exceeds 5MB limit');
                    fileInput.value = '';
                    fileNameSpan.textContent = 'Choose file (PDF, DOCX, TXT)';
                }
            }
        });
    }
    
    // Form submission with progress indicator
    if (uploadForm) {
        uploadForm.addEventListener('submit', function() {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
            progressBar.style.display = 'block';
            
            // Animate progress bar (simulated)
            const progress = progressBar.querySelector('.progress');
            let width = 0;
            const interval = setInterval(() => {
                width += 5;
                progress.style.width = width + '%';
                
                if (width >= 90) {
                    clearInterval(interval);
                }
            }, 200);
        });
    }
    
    // Question page functionality
    const timerElement = document.querySelector('.timer');
    if (timerElement) {
        const timeLimit = parseInt(timerElement.dataset.timeLimit) * 60; // Convert to seconds
        let timeLeft = timeLimit;
        
        const timerId = setInterval(() => {
            timeLeft--;
            
            if (timeLeft <= 0) {
                clearInterval(timerId);
                timerElement.textContent = "Time's up!";
                timerElement.style.color = "red";
                return;
            }
            
            const hours = Math.floor(timeLeft / 3600);
            const minutes = Math.floor((timeLeft % 3600) / 60);
            const seconds = timeLeft % 60;
            
            timerElement.textContent = `Time remaining: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    // Skip button confirmation
    const skipButtons = document.querySelectorAll('button[value="skip"]');
    skipButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            if (!confirm('Are you sure you want to skip this question? You won\'t be able to return to it.')) {
                e.preventDefault();
            }
        });
    });
    
    // End test button confirmation
    const endTestButtons = document.querySelectorAll('button[value="end-test"]');
    endTestButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            if (!confirm('Are you sure you want to end the test now? You won\'t be able to return to unanswered questions.')) {
                e.preventDefault();
            }
        });
    });
});

// const editor = ace.edit("editor");
// editor.setTheme("ace/theme/monokai");
// editor.session.setMode("ace/mode/javascript");

// document.getElementById("language").addEventListener("change", function () {
//     const mode = this.value === "cpp" ? "c_cpp" : this.value;
//     editor.session.setMode("ace/mode/" + mode);
// });

// const form = document.querySelector("form");
// form.addEventListener("submit", function () {
//     document.getElementById("code").value = editor.getValue();
// });