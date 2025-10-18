const { ipcRenderer } = require('electron');

class RS485Adjuster {
    constructor() {
        this.isConnected = false;
        this.currentPort = null;
        this.currentBaudRate = 9600;
        this.deviceAddress = 1;
        this.logData = [];
        this.writeLogEnabled = false;
        this.loadedTabs = new Map(); // Cache for loaded tab templates
        this.currentTab = 'am1'; // Default tab
        
        this.initializeElements();
        this.bindEvents();
        this.loadAvailablePorts();
        
        // Load initial tab
        this.loadTab('am1');
    }

    initializeElements() {
        // Connection elements
        this.comPortSelect = document.getElementById('comPort');
        this.baudRateSelect = document.getElementById('baudRate');
        this.connectBtn = document.getElementById('connectBtn');
        this.writeLogCheckbox = document.getElementById('writeLog');
        this.openLogBtn = document.getElementById('openLogBtn');

        // Tab elements
        this.tabs = document.querySelectorAll('.tab');
        this.tabContent = document.querySelector('.tab-content');

        // Results elements
        this.testResults = document.getElementById('testResults');
        this.thirdColumnHeader = document.getElementById('thirdColumnHeader');

        // Modal elements
        this.logModal = document.getElementById('logModal');
        this.logContent = document.getElementById('logContent');
        this.modalClose = document.querySelector('.modal-close');
        this.clearLogBtn = document.getElementById('clearLogBtn');
        this.exportLogBtn = document.getElementById('exportLogBtn');

        // Toast element
        this.toast = document.getElementById('toast');
    }

    async loadTab(tabName) {
        try {
            // Show loading indicator
            this.showTabLoading();
            
            // Check if tab is already loaded
            if (this.loadedTabs.has(tabName)) {
                this.displayTab(tabName);
                return;
            }
            
            // Load HTML template
            const htmlResponse = await fetch(`tabs/${tabName}.html`);
            if (!htmlResponse.ok) {
                throw new Error(`Failed to load ${tabName}.html`);
            }
            const htmlContent = await htmlResponse.text();
            
            // Load CSS template
            const cssResponse = await fetch(`tabs/${tabName}.css`);
            if (!cssResponse.ok) {
                throw new Error(`Failed to load ${tabName}.css`);
            }
            const cssContent = await cssResponse.text();
            
            // Cache the loaded content
            this.loadedTabs.set(tabName, {
                html: htmlContent,
                css: cssContent
            });
            
            // Display the tab
            this.displayTab(tabName);
            
        } catch (error) {
            console.error(`Error loading tab ${tabName}:`, error);
            this.showTabError(tabName, error.message);
        }
    }
    
    displayTab(tabName) {
        const tabData = this.loadedTabs.get(tabName);
        if (!tabData) return;
        
        // Clear current content
        this.tabContent.innerHTML = '';
        
        // Create container for tab content
        const tabContainer = document.createElement('div');
        tabContainer.innerHTML = tabData.html;
        
        // Add CSS styles
        const styleElement = document.createElement('style');
        styleElement.textContent = tabData.css;
        styleElement.setAttribute('data-tab', tabName);
        document.head.appendChild(styleElement);
        
        // Append tab content
        this.tabContent.appendChild(tabContainer);
        
        // Update current tab
        this.currentTab = tabName;
        
        // Reinitialize elements for the new tab
        this.initializeTabElements();
        
        // Update body class
        this.updateBodyClass(tabName);
        
        // Update third column header
        this.updateThirdColumnHeader(tabName);
    }
    
    showTabLoading() {
        this.tabContent.innerHTML = `
            <div id="tab-loading" class="tab-loading">
                <div class="loading-spinner">
                    <div class="loading"></div>
                    <p>Загрузка вкладки...</p>
                </div>
            </div>
        `;
    }
    
    showTabError(tabName, errorMessage) {
        this.tabContent.innerHTML = `
            <div class="tab-error">
                <div class="error-content">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Ошибка загрузки вкладки</h3>
                    <p>Не удалось загрузить вкладку "${tabName}"</p>
                    <p class="error-details">${errorMessage}</p>
                    <button class="btn btn-primary" onclick="location.reload()">
                        <i class="fas fa-refresh"></i>
                        Перезагрузить
                    </button>
                </div>
            </div>
        `;
    }
    
    initializeTabElements() {
        // Reinitialize elements that might be in the loaded tab
        this.writeBtn = document.getElementById('writeBtn');
        this.writeBtnAm8 = document.getElementById('writeBtnAm8');
        this.writeBtnPm = document.getElementById('writeBtnPm');
        // writeBtnPmGeneral removed - PM uses only pm-button-container
        this.writeBtnKl = document.getElementById('writeBtnKl');
        // writeBtnKlGeneral removed - KL uses only kl-button-container
        this.autorequestCheckboxKl = document.getElementById('autorequestCheckboxKl');
        
        // Bind events for new elements
        this.bindTabEvents();
    }
    
    bindTabEvents() {
        // Bind events for tab-specific buttons
        if (this.writeBtn) {
            this.writeBtn.addEventListener('click', () => this.writeParameters());
        }
        if (this.writeBtnAm8) {
            this.writeBtnAm8.addEventListener('click', () => this.writeParameters());
        }
        if (this.writeBtnPm) {
            this.writeBtnPm.addEventListener('click', () => this.writeParameters());
        }
        // writeBtnPmGeneral event handler removed - button no longer exists
        if (this.writeBtnKl) {
            this.writeBtnKl.addEventListener('click', () => this.writeParameters());
        }
        // writeBtnKlGeneral event handler removed - button no longer exists
        
        // Bind events for KL autorequest checkbox
        if (this.autorequestCheckboxKl) {
            this.autorequestCheckboxKl.addEventListener('change', (e) => {
                this.writeLogEnabled = e.target.checked;
                this.logMessage(`Автозапрос ${this.writeLogEnabled ? 'включен' : 'отключен'}`);
            });
        }
        
        // Bind events for other tab-specific elements
        // This can be extended for specific tab functionality
    }
    
    updateBodyClass(tabName) {
        // Remove all tab-specific body classes
        document.body.classList.remove('am-active', 'am1-active', 'am8-active', 'pm-active', 'kl-active', 'sensors-active', 'mok-active');
        
        // Add new body class
        const bodyClass = `${tabName}-active`;
        document.body.classList.add(bodyClass);
        
        // Debug: log the current body classes
        console.log('Current body classes:', document.body.className);
        console.log('Active tab:', tabName);
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
        if (this.writeBtn) {
            this.writeBtn.addEventListener('click', () => this.writeParameters());
        }
        if (this.writeBtnPm) {
            this.writeBtnPm.addEventListener('click', () => this.writeParameters());
        }

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

    // updateConnectionStatus method removed - no longer needed

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
        // Remove active class from all tabs
        this.tabs.forEach(tab => tab.classList.remove('active'));

        // Add active class to selected tab
        const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            
            // Load the tab content
            this.loadTab(tabName);
        }
    }

    updateThirdColumnHeader(tabName) {
        if (this.thirdColumnHeader) {
            // Для вкладок АМ1 и АМ8 - "Состояние входа"
            // Для вкладки РМ - "Состояние реле"
            if (tabName === 'am1' || tabName === 'am8') {
                this.thirdColumnHeader.textContent = 'Состояние входа';
            } else if (tabName === 'pm') {
                this.thirdColumnHeader.textContent = 'Состояние реле';
            } else {
                // Для остальных вкладок оставляем "Состояние входа" по умолчанию
                this.thirdColumnHeader.textContent = 'Состояние входа';
            }
        }
    }

    async writeParameters() {
        if (!this.isConnected) {
            this.showToast('warning', 'Сначала подключитесь к устройству');
            return;
        }

        try {
            // Find the active write button
            let activeButton;
            if (this.currentTab === 'am1') {
                activeButton = this.writeBtn;
            } else if (this.currentTab === 'am8') {
                activeButton = this.writeBtnAm8;
            } else if (this.currentTab === 'pm') {
                activeButton = this.writeBtnPm;
            } else if (this.currentTab === 'kl') {
                activeButton = this.writeBtnKl;
            } else {
                activeButton = this.writeBtn;
            }
            
            if (activeButton) {
                this.showLoading(activeButton);
                activeButton.disabled = true;
            }

            // Get current parameters from the active tab
            const parameters = this.getCurrentParameters();

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
            let activeButton;
            if (this.currentTab === 'am1') {
                activeButton = this.writeBtn;
            } else if (this.currentTab === 'am8') {
                activeButton = this.writeBtnAm8;
            } else if (this.currentTab === 'pm') {
                activeButton = this.writeBtnPm;
            } else if (this.currentTab === 'kl') {
                activeButton = this.writeBtnKl;
            } else {
                activeButton = this.writeBtn;
            }
            
            if (activeButton) {
                this.hideLoading(activeButton);
                activeButton.disabled = false;
            }
        }
    }


    getCurrentParameters() {
        const parameters = {};
        
        // Collect parameters from all input and select elements in the current tab
        const inputs = this.tabContent.querySelectorAll('input, select');
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
