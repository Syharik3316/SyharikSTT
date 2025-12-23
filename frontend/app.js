let currentFileId = null;

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

async function handleFile(file) {
    // Проверка формата
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

    // Создаем FormData
    const formData = new FormData();
    formData.append('file', file);

    try {
        // Симулируем прогресс загрузки
        updateProgress(10, 'Загрузка файла на сервер...');
        
        const xhr = new XMLHttpRequest();
        
        // Отслеживаем прогресс загрузки
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                updateProgress(10 + (percentComplete * 0.3), 'Загрузка файла на сервер...');
            }
        });
        
        // Обрабатываем ответ
        xhr.addEventListener('load', () => {
            try {
                if (xhr.status === 200) {
                    updateProgress(40, 'Обработка файла...');
                    const data = JSON.parse(xhr.responseText);
                    currentFileId = data.file_id;
                    resultText.value = data.text;

                    // Устанавливаем название файла по умолчанию
                    if (fileNameInput) {
                        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                        fileNameInput.value = nameWithoutExt;
                    }

                    updateProgress(100, 'Готово!');

                    // Показываем результат через небольшую задержку
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
                        // если не JSON, используем текст ответа
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
        
        // Симулируем прогресс обработки
        setTimeout(() => updateProgress(50, 'Извлечение аудио...'), 1000);
        setTimeout(() => updateProgress(70, 'Транскрибация с помощью ИИ...'), 2000);
        
    } catch (error) {
        showError(error.message);
    }
}

function showError(message) {
    errorMessage.textContent = message;
    processingSection.style.display = 'none';
    resultSection.style.display = 'none';
    errorSection.style.display = 'block';
    updateProgress(0, '');
}

function resetUpload() {
    uploadSection.style.display = 'block';
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    currentFileId = null;
    resultText.value = '';
    fileInput.value = '';
    if (fileNameInput) {
        fileNameInput.value = '';
    }
    updateProgress(0, '');
}

// Сохранение текста
document.getElementById('saveBtn').addEventListener('click', async () => {
    if (!currentFileId) return;

    try {
        const filename = fileNameInput ? fileNameInput.value.trim() : null;
        const response = await fetch('/api/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_id: currentFileId,
                text: resultText.value,
                filename: filename || null
            })
        });

        if (response.ok) {
            alert('Изменения сохранены!');
        } else {
            throw new Error('Ошибка при сохранении');
        }
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
});

// Экспорт в TXT
document.getElementById('exportTxtBtn').addEventListener('click', () => {
    if (!currentFileId) return;
    window.location.href = `/api/export/txt/${currentFileId}`;
});

// Экспорт в DOCX
document.getElementById('exportDocxBtn').addEventListener('click', () => {
    if (!currentFileId) return;
    window.location.href = `/api/export/docx/${currentFileId}`;
});

// Новый файл
document.getElementById('newFileBtn').addEventListener('click', resetUpload);

