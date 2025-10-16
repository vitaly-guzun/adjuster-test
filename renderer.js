const { ipcRenderer } = require('electron');

class RS485Adjuster {
    constructor() {
        this.isConnected = false;
        this.currentPort = null;
        this.currentBaudRate = 9600;
        this.deviceAddress = 1;
        this.logData = [];
        this.writeLogEnabled = false;
        
        this.initializeElements();
        this.bindEvents();
        this.loadAvailablePorts();
    }

    initializeElements() {
        // Connection elements
        this.comPortSelect = document.getElementById('comPort');
        this.baudRateSelect = document.getElementById('baudRate');
        this.connectBtn = document.getElementById('connectBtn');
        this.writeLogCheckbox = document.getElementById('writeLog');
        this.openLogBtn = document.getElementById('openLogBtn');
        this.connectionStatus = document.getElementById('connectionStatus');

        // Parameter elements
        this.deviceAddressInput = document.getElementById('deviceAddress');
        this.addressUpBtn = document.getElementById('addressUp');
        this.addressDownBtn = document.getElementById('addressDown');
        this.writeBtn = document.getElementById('writeBtn');
        
        // Check if elements exist
        if (!this.writeBtn) {
            console.error('Required buttons not found');
        }

        // Tab elements
        this.tabs = document.querySelectorAll('.tab');
        this.tabPanels = document.querySelectorAll('.tab-panel');
        

        // Results elements
        this.testResults = document.getElementById('testResults');


        // Modal elements
        this.logModal = document.getElementById('logModal');
        this.logContent = document.getElementById('logContent');
        this.modalClose = document.querySelector('.modal-close');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.exportLogBtn = document.getElementById('exportLogBtn');

        // Toast element
        this.toast = document.getElementById('toast');
    }

    bindEvents() {
        // Connection events
        this.connectBtn.addEventListener('click', () => this.toggleConnection());
        this.openLogBtn.addEventListener('click', () => this.openLogModal());
        this.writeLogCheckbox.addEventListener('change', (e) => {
            this.writeLogEnabled = e.target.checked;
        });

        // Address control events
        if (this.addressUpBtn) {
            this.addressUpBtn.addEventListener('click', () => this.incrementAddress());
        }
        if (this.addressDownBtn) {
            this.addressDownBtn.addEventListener('click', () => this.decrementAddress());
        }
        if (this.deviceAddressInput) {
            this.deviceAddressInput.addEventListener('change', (e) => {
                this.deviceAddress = parseInt(e.target.value) || 1;
            });
        }

        // Action button events
        this.writeBtn.addEventListener('click', () => this.writeParameters());

        // Tab events
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Modal events
        this.modalClose.addEventListener('click', () => this.closeLogModal());
        this.clearLogBtn.addEventListener('click', () => this.clearLog());
        this.exportLogBtn.addEventListener('click', () => this.exportLog());

        // Click outside modal to close
        this.logModal.addEventListener('click', (e) => {
            if (e.target === this.logModal) {
                this.closeLogModal();
            }
        });

        // IPC events
        ipcRenderer.on('serial-data', (event, data) => {
            this.handleSerialData(data);
        });
    }

    async loadAvailablePorts() {
        try {
            this.showLoading(this.comPortSelect);
            const ports = await ipcRenderer.invoke('get-ports');
            
            this.comPortSelect.innerHTML = '<option value="">Выберите порт...</option>';
            
            ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.path;
                option.textContent = `${port.path} - ${port.manufacturer}`;
                this.comPortSelect.appendChild(option);
            });

            this.hideLoading(this.comPortSelect);
            
            if (ports.length === 0) {
                this.showToast('warning', 'COM порты не найдены');
            }
        } catch (error) {
            this.hideLoading(this.comPortSelect);
            this.showToast('error', 'Ошибка загрузки портов: ' + error.message);
        }
    }

    async toggleConnection() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            await this.connect();
        }
    }

    async connect() {
        const portPath = this.comPortSelect.value;
        const baudRate = this.baudRateSelect.value;

        if (!portPath) {
            this.showToast('warning', 'Выберите COM порт');
            return;
        }

        try {
            this.showLoading(this.connectBtn);
            this.connectBtn.disabled = true;

            const result = await ipcRenderer.invoke('connect-port', portPath, baudRate);

            if (result.success) {
                this.isConnected = true;
                this.currentPort = portPath;
                this.currentBaudRate = parseInt(baudRate);
                this.updateConnectionStatus(true);
                this.connectBtn.innerHTML = '<i class="fas fa-unlink"></i> Отключиться';
                this.showToast('success', 'Подключено к ' + portPath);
                
                // Обновить результаты теста
                this.updateTestResults();
            } else {
                this.showToast('error', 'Ошибка подключения: ' + result.message);
            }
        } catch (error) {
            this.showToast('error', 'Ошибка подключения: ' + error.message);
        } finally {
            this.hideLoading(this.connectBtn);
            this.connectBtn.disabled = false;
        }
    }

    async disconnect() {
        try {
            this.showLoading(this.connectBtn);
            this.connectBtn.disabled = true;

            const result = await ipcRenderer.invoke('disconnect-port');

            if (result.success) {
                this.isConnected = false;
                this.currentPort = null;
                this.updateConnectionStatus(false);
                this.connectBtn.innerHTML = '<i class="fas fa-plug"></i> Подключиться';
                this.showToast('info', 'Отключено');
                
                // Сбросить результаты теста
                this.resetTestResults();
            }
        } catch (error) {
            this.showToast('error', 'Ошибка отключения: ' + error.message);
        } finally {
            this.hideLoading(this.connectBtn);
            this.connectBtn.disabled = false;
        }
    }

    updateConnectionStatus(connected) {
        const statusIndicator = this.connectionStatus.querySelector('.status-indicator');
        const statusText = this.connectionStatus.querySelector('span');

        if (connected) {
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Подключено';
        } else {
            statusIndicator.classList.remove('connected');
            statusText.textContent = 'Отключено';
        }
    }

    incrementAddress() {
        if (this.deviceAddress < 247) {
            this.deviceAddress++;
            if (this.deviceAddressInput) {
                this.deviceAddressInput.value = this.deviceAddress;
            }
        }
    }

    decrementAddress() {
        if (this.deviceAddress > 1) {
            this.deviceAddress--;
            if (this.deviceAddressInput) {
                this.deviceAddressInput.value = this.deviceAddress;
            }
        }
    }

    switchTab(tabName) {
        // Remove active class from all tabs and panels
        this.tabs.forEach(tab => tab.classList.remove('active'));
        this.tabPanels.forEach(panel => panel.classList.remove('active'));

        // Add active class to selected tab and panel
        const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
        const selectedPanel = document.getElementById(tabName);
        
        if (selectedTab && selectedPanel) {
            selectedTab.classList.add('active');
            selectedPanel.classList.add('active');
        }
    }

    async writeParameters() {
        if (!this.isConnected) {
            this.showToast('warning', 'Сначала подключитесь к устройству');
            return;
        }

        try {
            this.showLoading(this.writeBtn);
            this.writeBtn.disabled = true;

            // Получить текущие параметры из активной панели
            const activePanel = document.querySelector('.tab-panel.active');
            const parameters = this.getCurrentParameters(activePanel);

            const result = await ipcRenderer.invoke('write-parameters', this.deviceAddress, parameters);

            if (result.success) {
                this.showToast('success', 'Параметры записаны успешно');
                this.logMessage(`Запись параметров для адреса ${this.deviceAddress}: ${JSON.stringify(parameters)}`);
            } else {
                this.showToast('error', 'Ошибка записи: ' + result.message);
            }
        } catch (error) {
            this.showToast('error', 'Ошибка записи: ' + error.message);
        } finally {
            this.hideLoading(this.writeBtn);
            this.writeBtn.disabled = false;
        }
    }


    getCurrentParameters(panel) {
        const parameters = {};
        
        // Собрать параметры из всех input и select элементов в панели
        const inputs = panel.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (input.id || input.name) {
                const key = input.id || input.name;
                parameters[key] = input.value;
            }
        });

        return parameters;
    }

    updateTestResults() {
        const rows = this.testResults.querySelectorAll('.table-row');
        
        rows.forEach((row, index) => {
            // Обновить статус питания
            const powerStatus = row.querySelector('.table-cell:nth-child(2) .status-indicator');
            powerStatus.className = 'status-indicator online';
            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';

            // Обновить статус входа
            const inputStatus = row.querySelector('.table-cell:nth-child(3) .status-indicator');
            inputStatus.className = 'status-indicator online';
            inputStatus.innerHTML = '<i class="fas fa-circle"></i> Активно';
        });
    }

    resetTestResults() {
        const rows = this.testResults.querySelectorAll('.table-row');
        
        rows.forEach((row, index) => {
            // Сбросить статус питания
            const powerStatus = row.querySelector('.table-cell:nth-child(2) .status-indicator');
            powerStatus.className = 'status-indicator offline';
            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';

            // Сбросить статус входа
            const inputStatus = row.querySelector('.table-cell:nth-child(3) .status-indicator');
            inputStatus.className = 'status-indicator offline';
            inputStatus.innerHTML = '<i class="fas fa-circle"></i> Неактивно';
        });
    }

    handleSerialData(data) {
        this.logMessage(`Получено: ${data}`);
        
        // Обработка ответов от устройства
        if (data.includes('OK')) {
            this.showToast('success', 'Команда выполнена успешно');
        } else if (data.includes('ERROR')) {
            this.showToast('error', 'Ошибка выполнения команды');
        }
    }

    logMessage(message) {
        if (this.writeLogEnabled) {
            const timestamp = new Date().toLocaleString();
            const logEntry = `[${timestamp}] ${message}`;
            this.logData.push(logEntry);
            
            // Ограничить размер лога
            if (this.logData.length > 1000) {
                this.logData = this.logData.slice(-500);
            }
        }
    }

    openLogModal() {
        this.updateLogContent();
        this.logModal.style.display = 'block';
    }

    closeLogModal() {
        this.logModal.style.display = 'none';
    }

    updateLogContent() {
        this.logContent.innerHTML = this.logData.length > 0 
            ? this.logData.join('\n') 
            : 'Лог пуст';
    }

    clearLog() {
        this.logData = [];
        this.updateLogContent();
        this.showToast('info', 'Лог очищен');
    }

    exportLog() {
        if (this.logData.length === 0) {
            this.showToast('warning', 'Лог пуст');
            return;
        }

        const logText = this.logData.join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `rs485-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showToast('success', 'Лог экспортирован');
    }

    showLoading(element) {
        const loading = document.createElement('div');
        loading.className = 'loading';
        element.appendChild(loading);
        element.style.opacity = '0.7';
    }

    hideLoading(element) {
        const loading = element.querySelector('.loading');
        if (loading) {
            loading.remove();
        }
        element.style.opacity = '1';
    }

    showToast(type, message) {
        const toastIcon = this.toast.querySelector('.toast-icon');
        const toastMessage = this.toast.querySelector('.toast-message');
        
        // Удалить предыдущие классы типа
        this.toast.classList.remove('success', 'error', 'warning', 'info');
        
        // Добавить новый класс типа
        this.toast.classList.add(type);
        
        // Установить иконку
        const icons = {
            success: 'fas fa-check',
            error: 'fas fa-times',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        toastIcon.className = `toast-icon ${icons[type] || icons.info}`;
        toastMessage.textContent = message;
        
        // Показать toast
        this.toast.classList.add('show');
        
        // Скрыть через 4 секунды
        setTimeout(() => {
            this.toast.classList.remove('show');
        }, 4000);
    }

}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    new RS485Adjuster();
});

// Горячие клавиши
document.addEventListener('keydown', (e) => {
    // Ctrl+R - обновить список портов
    if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        window.location.reload();
    }
    
    // Ctrl+L - открыть лог
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        document.getElementById('openLogBtn').click();
    }
    
});
