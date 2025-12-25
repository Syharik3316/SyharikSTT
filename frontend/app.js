let currentFileId = null;
let history = [];
let itemToDelete = null;

// DOM элементы
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const processingSection = document.getElementById('processingSection');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const resultText = document.getElementById('resultText');
const processingFilename = document.getElementById('processingFilename');
const errorMessage = document.getElementById('errorMessage');
const processingStatus = document.getElementById('processingStatus');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const fileNameInput = document.getElementById('fileNameInput');
const historyList = document.getElementById('historyList');
const historyEmpty = document.getElementById('historyEmpty');
const historyContent = document.getElementById('historyContent');
const historyToggle = document.getElementById('historyToggle');
const deleteModal = document.getElementById('deleteModal');
const modalFilename = document.getElementById('modalFilename');

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    setupEventListeners();
    setupPasteHandler();
});

// Настройка обработчиков событий
function setupEventListeners() {
    // Обработка drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Кнопки
    document.getElementById('saveBtn').addEventListener('click', saveTranscription);
    document.getElementById('exportTxtBtn').addEventListener('click', exportTxt);
    document.getElementById('exportDocxBtn').addEventListener('click', exportDocx);
    document.getElementById('newFileBtn').addEventListener('click', resetUpload);
    document.getElementById('shareBtn').addEventListener('click', shareTranscription);
}

// Обработчик вставки файла из буфера обмена
function setupPasteHandler() {
    document.addEventListener('paste', (e) => {
        if (e.clipboardData.files.length > 0) {
            const file = e.clipboardData.files[0];
            const allowedExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.mov', '.avi'];
            const fileExt = '.' + file.name.split('.').pop().toLowerCase();
            
            if (allowedExtensions.includes(fileExt)) {
                handleFile(file);
            } else {
                showError('Неподдерживаемый формат файла. Используйте: MP3, WAV, M4A, OGG, MP4, MOV, AVI');
            }
        }
    });
}

// Обновление прогресса
function updateProgress(percent, status) {
    if (progressFill) {
        progressFill.style.width = percent + '%';
    }
    if (progressText) {
        progressText.textContent = Math.round(percent) + '%';
    }
    if (processingStatus) {
        processingStatus.textContent = status;
    }
}

// Обработка файла
async function handleFile(file) {
    const allowedExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.mp4', '.mov', '.avi'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExt)) {
        showError('Неподдерживаемый формат файла. Используйте: MP3, WAV, M4A, OGG, MP4, MOV, AVI');
        return;
    }

    // Показываем секцию обработки
    uploadSection.style.display = 'none';
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    processingSection.style.display = 'block';
    processingFilename.textContent = file.name;
    updateProgress(0, 'Загрузка файла...');

    const formData = new FormData();
    formData.append('file', file);

    try {
        updateProgress(10, 'Загрузка файла на сервер...');
        
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateProgress(10 + (percentComplete * 0.3), 'Загрузка файла на сервер...');
            }
        });
        
        xhr.addEventListener('load', () => {
            try {
                if (xhr.status === 200) {
                    updateProgress(40, 'Обработка файла...');
                    const data = JSON.parse(xhr.responseText);
                    currentFileId = data.file_id;
                    resultText.value = data.text;

                    // Устанавливаем название файла
                    if (fileNameInput) {
                        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                        fileNameInput.value = nameWithoutExt;
                    }

                    updateProgress(100, 'Готово!');

                    // Добавляем в историю
                    addToHistory({
                        id: data.file_id,
                        filename: file.name,
                        text: data.text,
                        date: new Date().toISOString(),
                        size: formatFileSize(file.size),
                        lastModified: new Date().toISOString()
                    });

                    // Показываем результат
                    setTimeout(() => {
                        processingSection.style.display = 'none';
                        resultSection.style.display = 'block';
                    }, 500);
                } else {
                    let errorDetail = 'Ошибка при загрузке файла';
                    try {
                        const parsed = JSON.parse(xhr.responseText);
                        errorDetail = parsed.detail || xhr.responseText || errorDetail;
                    } catch (e) {
                        errorDetail = xhr.responseText || errorDetail;
                    }
                    showError(errorDetail);
                }
            } catch (e) {
                showError(e.message || 'Неизвестная ошибка обработки ответа');
            }
        });

        xhr.addEventListener('error', () => {
            showError('Ошибка сети при загрузке файла');
        });
        
        xhr.open('POST', '/api/upload');
        xhr.send(formData);
        
        // Симулируем прогресс
        setTimeout(() => updateProgress(50, 'Извлечение аудио...'), 1000);
        setTimeout(() => updateProgress(70, 'Транскрибация с помощью ИИ...'), 2000);
        
    } catch (error) {
        showError(error.message);
    }
}

// Форматирование размера файла
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// История транскрипций
function loadHistory() {
    const savedHistory = localStorage.getItem('transcriptionHistory');
    if (savedHistory) {
        history = JSON.parse(savedHistory);
        renderHistory();
    }
}

function saveHistory() {
    localStorage.setItem('transcriptionHistory', JSON.stringify(history));
}

function addToHistory(item) {
    // Проверяем, существует ли уже запись с таким ID
    const existingIndex = history.findIndex(h => h.id === item.id);
    
    if (existingIndex !== -1) {
        // Обновляем существующую запись
        history[existingIndex] = {
            ...history[existingIndex],
            ...item,
            lastModified: new Date().toISOString()
        };
    } else {
        // Добавляем новую запись
        item.lastModified = item.lastModified || new Date().toISOString();
        history.unshift(item);
        
        // Ограничиваем историю 50 записями
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
    }
    
    saveHistory();
    renderHistory();
}

function removeFromHistory(id) {
    const index = history.findIndex(item => item.id === id);
    if (index !== -1) {
        history.splice(index, 1);
        saveHistory();
        renderHistory();
    }
}

function renderHistory() {
    if (history.length === 0) {
        historyList.innerHTML = '';
        historyEmpty.style.display = 'block';
        return;
    }
    
    historyEmpty.style.display = 'none';
    historyList.innerHTML = '';
    
    history.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.id = `history-${item.id}`;
        
        // Создаем превью текста (первые 100 символов)
        const preview = item.text.length > 100 
            ? item.text.substring(0, 100) + '...' 
            : item.text;
        
        // Форматируем дату
        const date = new Date(item.lastModified || item.date);
        const formattedDate = date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Показываем метку "изменено", если файл редактировался
        const isModified = item.lastModified && item.lastModified !== item.date;
        
        historyItem.innerHTML = `
            <div class="history-item-icon">
                <i class="fas fa-file-alt"></i>
            </div>
            <div class="history-item-content">
                <div class="history-item-title">${item.filename}
                    ${isModified ? '<span class="modified-badge">изменен</span>' : ''}
                </div>
                <div class="history-item-preview">${preview}</div>
                <div class="history-item-meta">
                    <span class="history-item-date">
                        <i class="far fa-calendar"></i> ${formattedDate}
                    </span>
                    <span class="history-item-size">
                        <i class="fas fa-weight-hanging"></i> ${item.size || 'N/A'}
                    </span>
                </div>
            </div>
            <div class="history-item-actions">
                <button class="history-action-btn view" onclick="viewHistoryItem('${item.id}')" title="Просмотр">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="history-action-btn delete" onclick="showDeleteModal('${item.id}', '${item.filename}')" title="Удалить">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
        
        historyList.appendChild(historyItem);
    });
}

function viewHistoryItem(id) {
    const item = history.find(item => item.id === id);
    if (item) {
        currentFileId = item.id;
        resultText.value = item.text;
        
        // Устанавливаем название файла
        if (fileNameInput) {
            const nameWithoutExt = item.filename.replace(/\.[^/.]+$/, '');
            fileNameInput.value = nameWithoutExt;
        }
        
        // Переключаем на секцию результата
        uploadSection.style.display = 'none';
        processingSection.style.display = 'none';
        errorSection.style.display = 'none';
        resultSection.style.display = 'block';
        
        // Прокручиваем к результату
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Модальное окно удаления
function showDeleteModal(id, filename) {
    itemToDelete = id;
    modalFilename.textContent = filename;
    deleteModal.style.display = 'flex';
}

function closeDeleteModal() {
    itemToDelete = null;
    deleteModal.style.display = 'none';
}

function confirmDelete() {
    if (itemToDelete) {
        removeFromHistory(itemToDelete);
        closeDeleteModal();
    }
}

// Переключение видимости истории
function toggleHistory() {
    const isVisible = historyContent.style.display !== 'none';
    historyContent.style.display = isVisible ? 'none' : 'block';
    
    // Анимируем иконку
    const icon = historyToggle.querySelector('i');
    if (isVisible) {
        icon.className = 'fas fa-chevron-down';
    } else {
        icon.className = 'fas fa-chevron-up';
    }
}

// Сохранение транскрипции с синхронизацией
// Обновленная функция saveTranscription (только для ясности):
async function saveTranscription() {
    if (!currentFileId) {
        throw new Error('Нет активного файла для сохранения');
    }

    const filename = fileNameInput ? fileNameInput.value.trim() : null;
    const text = resultText.value.trim();
    
    if (!text) {
        throw new Error('Текст не может быть пустым');
    }

    try {
        // Отправляем на сервер
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_id: currentFileId,
                text: text,
                filename: filename || null
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
        }

        // Обновляем локальную историю
        const itemIndex = history.findIndex(item => item.id === currentFileId);
        if (itemIndex !== -1) {
            history[itemIndex] = {
                ...history[itemIndex],
                text: text,
                filename: filename || history[itemIndex].filename,
                lastModified: new Date().toISOString()
            };
            
            saveHistory();
            renderHistory();
        }
        
        return await response.json();
        
    } catch (error) {
        console.error('Ошибка сохранения:', error);
        
        // Пробуем сохранить хотя бы локально
        try {
            const itemIndex = history.findIndex(item => item.id === currentFileId);
            if (itemIndex !== -1) {
                history[itemIndex].text = text;
                if (filename) history[itemIndex].filename = filename;
                history[itemIndex].lastModified = new Date().toISOString();
                saveHistory();
                renderHistory();
                
                throw new Error('Изменения сохранены только локально (ошибка сервера)');
            } else {
                throw new Error('Файл не найден в истории');
            }
        } catch (localError) {
            throw new Error('Ошибка при сохранении: ' + error.message);
        }
    }
}

// Функция для показа уведомлений
function showNotification(message, type = 'success') {
    // Удаляем старое уведомление, если есть
    const oldNotification = document.querySelector('.notification');
    if (oldNotification) {
        oldNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'warning' ? 'exclamation-triangle' : 'exclamation-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    // Анимация появления
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Автоматическое скрытие
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// Экспорт в TXT
async function exportTxt() {
    if (!currentFileId) {
        showNotification('Нет активного файла для экспорта', 'warning');
        return;
    }
    
    try {
        // Показываем индикатор загрузки
        const btn = document.getElementById('exportTxtBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Подготовка...';
        btn.disabled = true;
        
        // Сначала сохраняем изменения на сервере
        await saveTranscription();
        
        // Создаем ссылку для скачивания
        const downloadLink = document.createElement('a');
        downloadLink.href = `/api/export/txt/${currentFileId}`;
        downloadLink.download = 'transcription.txt';
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        
        // Инициируем скачивание
        downloadLink.click();
        
        // Удаляем ссылку
        setTimeout(() => {
            document.body.removeChild(downloadLink);
            btn.innerHTML = originalText;
            btn.disabled = false;
            showNotification('Файл TXT успешно скачан!');
        }, 100);
        
    } catch (error) {
        console.error('Ошибка при экспорте TXT:', error);
        showNotification('Ошибка при подготовке файла для скачивания', 'error');
        
        // Восстанавливаем кнопку
        const btn = document.getElementById('exportTxtBtn');
        btn.innerHTML = '<i class="fas fa-file-download"></i> TXT';
        btn.disabled = false;
    }
}

// Экспорт в DOCX
async function exportDocx() {
    if (!currentFileId) {
        showNotification('Нет активного файла для экспорта', 'warning');
        return;
    }
    
    try {
        // Показываем индикатор загрузки
        const btn = document.getElementById('exportDocxBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Подготовка...';
        btn.disabled = true;
        
        // Сначала сохраняем изменения на сервере
        await saveTranscription();
        
        // Создаем ссылку для скачивания
        const downloadLink = document.createElement('a');
        downloadLink.href = `/api/export/docx/${currentFileId}`;
        downloadLink.download = 'transcription.docx';
        downloadLink.style.display = 'none';
        document.body.appendChild(downloadLink);
        
        // Инициируем скачивание
        downloadLink.click();
        
        // Удаляем ссылку
        setTimeout(() => {
            document.body.removeChild(downloadLink);
            btn.innerHTML = originalText;
            btn.disabled = false;
            showNotification('Файл DOCX успешно скачан!');
        }, 100);
        
    } catch (error) {
        console.error('Ошибка при экспорте DOCX:', error);
        showNotification('Ошибка при подготовке файла для скачивания', 'error');
        
        // Восстанавливаем кнопку
        const btn = document.getElementById('exportDocxBtn');
        btn.innerHTML = '<i class="fas fa-file-word"></i> DOCX';
        btn.disabled = false;
    }
}

// Поделиться (копирование текста в буфер обмена)
async function shareTranscription() {
    try {
        await navigator.clipboard.writeText(resultText.value);
        showNotification('Текст скопирован в буфер обмена!');
    } catch (err) {
        showNotification('Не удалось скопировать текст. Попробуйте выделить и скопировать вручную.', 'warning');
    }
}

// Сброс загрузки
function resetUpload() {
    uploadSection.style.display = 'block';
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    processingSection.style.display = 'none';
    currentFileId = null;
    resultText.value = '';
    fileInput.value = '';
    if (fileNameInput) {
        fileNameInput.value = '';
    }
    updateProgress(0, '');
    
    // Прокручиваем к началу
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Показать ошибку
function showError(message) {
    errorMessage.textContent = message;
    processingSection.style.display = 'none';
    resultSection.style.display = 'none';
    errorSection.style.display = 'block';
    updateProgress(0, '');
}

// Закрытие модального окна при клике вне его
window.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        closeDeleteModal();
    }
});

// Глобальные функции для использования в HTML
window.viewHistoryItem = viewHistoryItem;
window.showDeleteModal = showDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.toggleHistory = toggleHistory;