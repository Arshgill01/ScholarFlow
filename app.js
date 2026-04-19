// ScholarFlow - Basic Interactions
// Module 1: Core UI functionality

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const newNoteBtn = document.getElementById('newNoteBtn');
    const createFirstNote = document.getElementById('createFirstNote');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadFirstDoc = document.getElementById('uploadFirstDoc');
    const graphViewBtn = document.getElementById('graphViewBtn');
    const emptyWorkspace = document.getElementById('emptyWorkspace');
    const workspace = document.getElementById('workspace');
    const uploadModal = document.getElementById('uploadModal');
    const graphModal = document.getElementById('graphModal');
    const closeUploadModal = document.getElementById('closeUploadModal');
    const closeGraphModal = document.getElementById('closeGraphModal');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const noteEditor = document.getElementById('noteEditor');
    const noteTitleInput = document.getElementById('noteTitleInput');
    const saveStatus = document.getElementById('saveStatus');
    const wordCount = document.getElementById('wordCount');
    const charCount = document.getElementById('charCount');

    // Create new note
    function createNewNote() {
        emptyWorkspace.hidden = true;
        workspace.hidden = false;
        noteTitleInput.value = 'Untitled';
        noteEditor.value = '';
        noteEditor.focus();
        updateStats();
    }

    newNoteBtn.addEventListener('click', createNewNote);
    createFirstNote.addEventListener('click', createNewNote);

    // Upload modal
    function openUploadModal() {
        uploadModal.classList.add('active');
    }

    function closeUploadModalFn() {
        uploadModal.classList.remove('active');
    }

    uploadBtn.addEventListener('click', openUploadModal);
    uploadFirstDoc.addEventListener('click', openUploadModal);
    closeUploadModal.addEventListener('click', closeUploadModalFn);

    // Graph modal
    function openGraphModal() {
        graphModal.classList.add('active');
    }

    function closeGraphModalFn() {
        graphModal.classList.remove('active');
    }

    graphViewBtn.addEventListener('click', openGraphModal);
    closeGraphModal.addEventListener('click', closeGraphModalFn);

    // Close modals on backdrop click
    uploadModal.addEventListener('click', (e) => {
        if (e.target === uploadModal) closeUploadModalFn();
    });

    graphModal.addEventListener('click', (e) => {
        if (e.target === graphModal) closeGraphModalFn();
    });

    // File upload
    uploadArea.addEventListener('click', () => fileInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = 'var(--border-focus)';
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '';
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileUpload(files[0]);
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFileUpload(e.target.files[0]);
    });

    function handleFileUpload(file) {
        if (file.type !== 'application/pdf') {
            alert('Please upload a PDF file');
            return;
        }

        console.log('Uploading:', file.name);
        // Show progress
        document.getElementById('uploadProgress').hidden = false;
        uploadArea.hidden = true;

        // Simulate upload progress
        let progress = 0;
        const progressFill = document.getElementById('progressFill');
        const interval = setInterval(() => {
            progress += 10;
            progressFill.style.width = progress + '%';
            
            if (progress >= 100) {
                clearInterval(interval);
                setTimeout(() => {
                    closeUploadModalFn();
                    document.getElementById('uploadProgress').hidden = true;
                    uploadArea.hidden = false;
                    progressFill.style.width = '0%';
                    fileInput.value = '';
                    
                    // Add to document list (placeholder)
                    console.log('File uploaded successfully:', file.name);
                }, 500);
            }
        }, 200);
    }

    // Editor stats and auto-save simulation
    function updateStats() {
        const text = noteEditor.value;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        
        wordCount.textContent = `${words} word${words !== 1 ? 's' : ''}`;
        charCount.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
    }

    let saveTimeout;
    noteEditor.addEventListener('input', () => {
        updateStats();
        
        // Show saving status
        saveStatus.innerHTML = '<span class="status-icon">○</span><span>Saving...</span>';
        
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveStatus.innerHTML = '<span class="status-icon">✓</span><span>Saved</span>';
        }, 1000);
    });

    // Title editing
    noteTitleInput.addEventListener('input', () => {
        document.getElementById('currentNoteTitle').textContent = noteTitleInput.value || 'Untitled';
    });

    // Toggle chat pane (mobile responsive behavior)
    const toggleChat = document.getElementById('toggleChat');
    const chatPane = document.getElementById('chatPane');
    
    toggleChat.addEventListener('click', () => {
        chatPane.style.display = chatPane.style.display === 'none' ? 'flex' : 'none';
    });

    // Toggle preview (placeholder functionality)
    const togglePreview = document.getElementById('togglePreview');
    togglePreview.addEventListener('click', () => {
        console.log('Preview mode toggle');
    });

    // Chat functionality (basic)
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const chatMessages = document.getElementById('chatMessages');

    function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        // Add user message
        const userMsg = document.createElement('div');
        userMsg.className = 'message user-message';
        userMsg.innerHTML = `<p>${escapeHtml(message)}</p>`;
        chatMessages.appendChild(userMsg);

        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Simulate AI response
        setTimeout(() => {
            const aiMsg = document.createElement('div');
            aiMsg.className = 'message ai-message';
            aiMsg.innerHTML = `
                <p>This is a simulated AI response. In the full implementation, this would search your knowledge base and provide context-aware answers with citations.</p>
            `;
            chatMessages.appendChild(aiMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 1000);
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // Utility function
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Suggested questions
    document.querySelectorAll('.suggested-q').forEach(btn => {
        btn.addEventListener('click', () => {
            chatInput.value = btn.textContent;
            sendMessage();
        });
    });
});