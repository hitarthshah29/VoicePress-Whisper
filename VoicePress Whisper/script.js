document.addEventListener('DOMContentLoaded', () => {
    // Input elements
    const inputs = {
        paperName: document.getElementById('paper-name'),
        tagline: document.getElementById('tagline'),
        edition: document.getElementById('edition'),
        headline: document.getElementById('headline'),
        subheadline: document.getElementById('subheadline'),
        reporter: document.getElementById('reporter'),
        category: document.getElementById('category'),
        source: document.getElementById('source'),
        sourceType: document.getElementById('source-type'),
        reportDate: document.getElementById('report-date'),
        story: document.getElementById('story')
    };

    // Preview elements
    const previews = {
        paperName: document.getElementById('preview-paper-name'),
        tagline: document.getElementById('preview-tagline'),
        edition: document.getElementById('preview-edition'),
        headline: document.getElementById('preview-headline'),
        subheadline: document.getElementById('preview-subheadline'),
        reporter: document.getElementById('preview-reporter'),
        category: document.getElementById('preview-category'),
        source: document.getElementById('preview-source'),
        sourceType: document.getElementById('preview-source-type'),
        reportDate: document.getElementById('preview-date'),
        story: document.getElementById('preview-story')
    };

    const reportIdElement = document.getElementById('preview-report-id');
    let currentReportId = '';

    const escapeHTML = (str) => {
        if (!str) return '';
        return str.replace(/[&<>'"]/g, 
            tag => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[tag] || tag)
        );
    };

    const generateReportId = () => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}${mm}${dd}`;
        
        const savedReports = JSON.parse(localStorage.getItem('voicepress_reports') || '[]');
        const todayReports = savedReports.filter(r => r.id && r.id.startsWith(`VP-${dateStr}-`));
        
        let sequence = 1;
        if (todayReports.length > 0) {
            const sequences = todayReports.map(r => parseInt(r.id.split('-')[2], 10));
            sequence = Math.max(...sequences) + 1;
        }
        
        return `VP-${dateStr}-${String(sequence).padStart(4, '0')}`;
    };

    currentReportId = generateReportId();

    if (!inputs.reportDate.value) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        inputs.reportDate.value = today;
    }

    const updatePreview = () => {
        previews.paperName.textContent = inputs.paperName.value || 'Dictated Daily';
        previews.tagline.textContent = inputs.tagline.value || '';
        previews.edition.textContent = inputs.edition.value ? `Edition: ${inputs.edition.value}` : '';
        previews.headline.textContent = inputs.headline.value || '';
        previews.subheadline.textContent = inputs.subheadline.value || '';
        previews.reporter.textContent = inputs.reporter.value || 'Anonymous';
        previews.category.textContent = inputs.category.value || 'General';
        previews.source.textContent = inputs.source.value || 'Unknown';
        previews.sourceType.textContent = inputs.sourceType.value || '';
        
        let dateStr = inputs.reportDate.value;
        if (dateStr) {
            const dateObj = new Date(dateStr);
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
            dateStr = dateObj.toLocaleDateString(undefined, options);
        }
        previews.reportDate.textContent = dateStr || '';
        
        reportIdElement.textContent = currentReportId;
        
        const storyText = inputs.story.value || '';
        const paragraphs = storyText.split(/\n\s*\n/).filter(p => p.trim() !== '');
        
        if (paragraphs.length > 0) {
            previews.story.innerHTML = paragraphs.map(p => {
                const escaped = escapeHTML(p).replace(/\n/g, '<br>');
                return `<p>${escaped}</p>`;
            }).join('');
        } else {
            previews.story.innerHTML = '';
        }
    };

    const statusElement = document.getElementById('whisper-status');
    const statusIndicator = document.getElementById('status-indicator');
    const lastSavedTime = document.getElementById('last-saved-time');

    let lastInputTime = 0;
    let utteranceStartValue = '';
    let lastValue = '';

    const commandMap = {
        'headline': 'headline',
        'go to headline': 'headline',
        'sub headline': 'subheadline',
        'subheadline': 'subheadline',
        'go to sub headline': 'subheadline',
        'go to subheadline': 'subheadline',
        'reporter': 'reporter',
        'go to reporter': 'reporter',
        'story': 'story',
        'go to story': 'story',
        'source': 'source',
        'go to source': 'source',
        'paper name': 'paper-name',
        'go to paper name': 'paper-name',
        'tagline': 'tagline',
        'go to tagline': 'tagline'
    };

    const editCommandMap = {
        'backspace': 'backspace',
        'back space': 'backspace',
        'delete word': 'delete-word',
        'delete last word': 'delete-word',
        'new line': 'new-line',
        'newline': 'new-line',
        'new paragraph': 'new-paragraph',
        'clear': 'clear',
        'clear everything': 'clear-everything'
    };

    // Attach event listeners to all inputs
    Object.values(inputs).forEach(input => {
        // Update status when field is focused
        input.addEventListener('focus', () => {
            const label = document.querySelector(`label[for="${input.id}"]`);
            const fieldName = label ? label.textContent.toLowerCase() : 'field';
            statusElement.textContent = `Editing ${fieldName}`;
            
            // Reset utterance tracking for the new field
            lastValue = input.value;
            utteranceStartValue = input.value;
            lastInputTime = Date.now();
        });

        // Reset status when field loses focus
        input.addEventListener('blur', () => {
            statusElement.textContent = 'WhisperFlow input ready';
        });

        input.addEventListener('input', (e) => {
            if (statusIndicator.textContent === 'Saved') {
                statusIndicator.textContent = 'Draft';
            }
            
            const now = Date.now();
            
            // If more than 800ms passed since last input, treat as a new speech utterance
            if (now - lastInputTime > 800) {
                utteranceStartValue = lastValue;
            }
            
            let currentValue = input.value;
            lastInputTime = now;
            lastValue = currentValue;

            if (currentValue.startsWith(utteranceStartValue)) {
                let rawAddedText = currentValue.slice(utteranceStartValue.length);
                
                // 1. Process Punctuation Commands
                let processedAddedText = rawAddedText
                    .replace(/\s*full stop\b/gi, '.')
                    .replace(/\s*period\b/gi, '.')
                    .replace(/\s*comma\b/gi, ',')
                    .replace(/\s*question mark\b/gi, '?')
                    .replace(/\s*exclamation mark\b/gi, '!')
                    .replace(/\s*colon\b/gi, ':')
                    .replace(/\s*semicolon\b/gi, ';')
                    .replace(/\s*open quote\s*/gi, ' "')
                    .replace(/\s*close quote\b/gi, '"');

                if (processedAddedText !== rawAddedText) {
                    let newStart = utteranceStartValue;
                    
                    if (/^[.,?!;:]/.test(processedAddedText.trimStart())) {
                        newStart = newStart.trimEnd();
                        processedAddedText = processedAddedText.trimStart();
                    } else if (processedAddedText.startsWith(' "')) {
                        newStart = newStart.trimEnd();
                    }
                    
                    input.value = newStart + processedAddedText;
                    currentValue = input.value;
                    lastValue = currentValue;
                }

                // 2. Voice command checking: only evaluate text typed in the current burst
                let addedText = currentValue.slice(utteranceStartValue.length).trim().toLowerCase();
                addedText = addedText.replace(/^[.?!,;:]\s*/, '').replace(/[.?!,;:]$/, '');
                
                if (editCommandMap[addedText]) {
                    const cmd = editCommandMap[addedText];
                    
                    // Revert the text to remove the command itself
                    input.value = utteranceStartValue;
                    
                    if (cmd === 'backspace') {
                        input.value = utteranceStartValue.slice(0, -1);
                    } else if (cmd === 'delete-word') {
                        input.value = utteranceStartValue.trimEnd().replace(/\S+$/, '');
                    } else if (cmd === 'new-line') {
                        if (input.tagName.toLowerCase() === 'textarea') {
                            input.value = utteranceStartValue + '\n';
                        }
                    } else if (cmd === 'new-paragraph') {
                        if (input.id === 'story') {
                            input.value = utteranceStartValue + '\n\n';
                        } else {
                            const storyField = document.getElementById('story');
                            if (storyField) {
                                storyField.value = storyField.value + '\n\n';
                                setTimeout(() => storyField.focus(), 10);
                            }
                        }
                    } else if (cmd === 'clear') {
                        if (confirm('Are you sure you want to clear this field?')) {
                            input.value = '';
                        }
                    } else if (cmd === 'clear-everything') {
                        if (confirm('Are you sure you want to clear the entire Story field?')) {
                            const storyField = document.getElementById('story');
                            if (storyField) {
                                storyField.value = '';
                                if (input.id === 'story') {
                                    input.value = '';
                                }
                            }
                        }
                    }

                    lastValue = input.value;
                    utteranceStartValue = input.value;
                } 
                else if (commandMap[addedText]) {
                    const targetId = commandMap[addedText];
                    
                    // Revert the text to remove the command
                    input.value = utteranceStartValue;
                    lastValue = utteranceStartValue;
                    
                    // Focus the target field
                    const targetElement = document.getElementById(targetId);
                    if (targetElement) {
                        setTimeout(() => {
                            targetElement.focus();
                        }, 10);
                    }
                }
            }
            
            updatePreview();
        });
    });

    // Initial update
    updatePreview();

    // -------------------------
    // Saved Reports Logic
    // -------------------------
    
    const btnSave = document.getElementById('btn-save');
    const btnNew = document.getElementById('btn-new');
    const btnSaved = document.getElementById('btn-saved');
    
    const modal = document.getElementById('saved-reports-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const savedReportsList = document.getElementById('saved-reports-list');

    btnSave.addEventListener('click', () => {
        if (!inputs.source.value.trim()) {
            alert('A source is required before this report can be saved or printed.');
            return;
        }

        const report = {
            id: currentReportId,
            paperName: inputs.paperName.value,
            tagline: inputs.tagline.value,
            edition: inputs.edition.value,
            headline: inputs.headline.value,
            subheadline: inputs.subheadline.value,
            reporter: inputs.reporter.value,
            story: inputs.story.value,
            category: inputs.category.value,
            source: inputs.source.value,
            sourceType: inputs.sourceType.value,
            reportDate: inputs.reportDate.value,
            timestamp: Date.now()
        };

        let savedReports = JSON.parse(localStorage.getItem('voicepress_reports') || '[]');
        const existingIndex = savedReports.findIndex(r => r.id === currentReportId);
        
        if (existingIndex >= 0) {
            savedReports[existingIndex] = report;
        } else {
            savedReports.push(report);
        }
        
        localStorage.setItem('voicepress_reports', JSON.stringify(savedReports));
        
        statusIndicator.textContent = 'Saved';
        lastSavedTime.textContent = new Date().toLocaleTimeString();
        
        alert('Report saved successfully!');
    });

    btnNew.addEventListener('click', () => {
        if(confirm('Are you sure you want to start a new report? Unsaved changes will be lost.')){
            inputs.paperName.value = 'Dictated Daily';
            inputs.tagline.value = 'News, Spoken Aloud';
            inputs.edition.value = '';
            inputs.headline.value = '';
            inputs.subheadline.value = '';
            inputs.reporter.value = '';
            inputs.story.value = '';
            inputs.category.value = 'Campus';
            inputs.source.value = '';
            inputs.sourceType.value = 'I witnessed it';
            
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
            inputs.reportDate.value = today;
            
            currentReportId = generateReportId();
            
            lastValue = '';
            utteranceStartValue = '';
            
            statusIndicator.textContent = 'Draft';
            lastSavedTime.textContent = 'Never';
            
            updatePreview();
            
            setTimeout(() => inputs.headline.focus(), 10);
        }
    });

    btnSaved.addEventListener('click', () => {
        renderSavedReports();
        modal.classList.remove('hidden');
    });

    btnCloseModal.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    const renderSavedReports = () => {
        const savedReports = JSON.parse(localStorage.getItem('voicepress_reports') || '[]');
        
        if (savedReports.length === 0) {
            savedReportsList.innerHTML = '<p>No saved reports found.</p>';
            return;
        }
        
        savedReports.sort((a, b) => b.timestamp - a.timestamp);
        savedReportsList.innerHTML = '';
        
        savedReports.forEach(report => {
            const item = document.createElement('div');
            item.className = 'report-item';
            
            item.innerHTML = `
                <div class="report-item-info">
                    <h3>${escapeHTML(report.headline || 'Untitled Report')}</h3>
                    <div class="report-item-meta">
                        ID: ${report.id} | Category: ${escapeHTML(report.category || 'N/A')} | Date: ${report.reportDate || 'N/A'}
                    </div>
                </div>
                <div class="report-item-actions">
                    <button class="btn-open" data-id="${report.id}">Open</button>
                    <button class="btn-delete" data-id="${report.id}">Delete</button>
                </div>
            `;
            savedReportsList.appendChild(item);
        });

        document.querySelectorAll('.btn-open').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                openReport(id);
                modal.classList.add('hidden');
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                deleteReport(id);
            });
        });
    };

    const openReport = (id) => {
        const savedReports = JSON.parse(localStorage.getItem('voicepress_reports') || '[]');
        const report = savedReports.find(r => r.id === id);
        if (report) {
            currentReportId = report.id;
            inputs.paperName.value = report.paperName || '';
            inputs.tagline.value = report.tagline || '';
            inputs.edition.value = report.edition || '';
            inputs.headline.value = report.headline || '';
            inputs.subheadline.value = report.subheadline || '';
            inputs.reporter.value = report.reporter || '';
            inputs.story.value = report.story || '';
            inputs.category.value = report.category || '';
            inputs.source.value = report.source || '';
            inputs.sourceType.value = report.sourceType || '';
            inputs.reportDate.value = report.reportDate || '';
            
            lastValue = '';
            utteranceStartValue = '';
            
            statusIndicator.textContent = 'Saved';
            lastSavedTime.textContent = new Date(report.timestamp).toLocaleTimeString();
            
            updatePreview();
        }
    };

    const deleteReport = (id) => {
        if(confirm('Are you sure you want to delete this report?')) {
            let savedReports = JSON.parse(localStorage.getItem('voicepress_reports') || '[]');
            savedReports = savedReports.filter(r => r.id !== id);
            localStorage.setItem('voicepress_reports', JSON.stringify(savedReports));
            renderSavedReports();
        }
    };

    const btnPrint = document.getElementById('btn-print');
    btnPrint.addEventListener('click', () => {
        if (!inputs.source.value.trim()) {
            alert('A source is required before this report can be saved or printed.');
            return;
        }
        window.print();
    });
});
