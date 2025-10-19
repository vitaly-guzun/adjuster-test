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
        this.waitingForRangeResponse = false; // Flag for waiting address range response
        this.waitingForRangeResponseAm8 = false; // Flag for waiting AM8 address range response
        this.waitingForRangeResponsePm = false; // Flag for waiting PM address range response
        
        // AM8 autowrite variables
        this.autowriteEnabledAm8 = false; // Flag for AM8 autowrite mode
        this.currentAddressIndexAm8 = 0; // Current address index for AM8 autowrite
        this.am8Addresses = []; // Array of 8 addresses for AM8 autowrite
        
        // PM autowrite variables
        this.currentAddressIndexPm = 0; // Current address index for PM autowrite (0-3 for 4 addresses)
        this.waitingForPmWriteResponse = false; // Flag for waiting PM address write response
        
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
        this.writeBtnSensors = document.getElementById('writeBtnSensors');
        this.requestRangeBtn = document.getElementById('requestRangeBtn');
        this.addressRangeSelect = document.getElementById('address-range');
        this.requestRangeBtnAm8 = document.getElementById('requestRangeBtnAm8');
        this.am8StartAddress = document.getElementById('am8-start-address');
        this.am8EndAddress = document.getElementById('am8-end-address');
        this.requestRangeBtnPm = document.getElementById('requestRangeBtnPm');
        this.pmStartAddress = document.getElementById('pm-start-address');
        this.pmEndAddress = document.getElementById('pm-end-address');
        this.autorequestCheckboxAm8 = document.getElementById('autorequestCheckboxAm8');
        this.autorequestCheckboxKl = document.getElementById('autorequestCheckboxKl');
        
        // Bind events for new elements
        this.bindTabEvents();
    }
    
    bindTabEvents() {
        // Bind events for tab-specific buttons only once
        if (this.writeBtn && !this.writeBtn._eventBound) {
            this.writeBtn.addEventListener('click', () => this.writeParameters());
            this.writeBtn._eventBound = true;
        }
        if (this.writeBtnAm8 && !this.writeBtnAm8._eventBound) {
            this.writeBtnAm8.addEventListener('click', () => this.writeParameters());
            this.writeBtnAm8._eventBound = true;
        }
        if (this.writeBtnPm && !this.writeBtnPm._eventBound) {
            this.writeBtnPm.addEventListener('click', () => this.writeParameters());
            this.writeBtnPm._eventBound = true;
        }
        if (this.writeBtnKl && !this.writeBtnKl._eventBound) {
            this.writeBtnKl.addEventListener('click', () => this.writeParameters());
            this.writeBtnKl._eventBound = true;
        }
        if (this.writeBtnSensors && !this.writeBtnSensors._eventBound) {
            this.writeBtnSensors.addEventListener('click', () => this.writeParameters());
            this.writeBtnSensors._eventBound = true;
        }
        
        // Bind events for AM1 address range request button
        if (this.requestRangeBtn && !this.requestRangeBtn._eventBound) {
            this.requestRangeBtn.addEventListener('click', () => this.requestAddressRange());
            this.requestRangeBtn._eventBound = true;
        }
        
        // Bind events for AM8 address range request button
        if (this.requestRangeBtnAm8 && !this.requestRangeBtnAm8._eventBound) {
            this.requestRangeBtnAm8.addEventListener('click', () => this.requestAddressRangeAm8());
            this.requestRangeBtnAm8._eventBound = true;
        }
        
        // Bind events for PM address range request button
        if (this.requestRangeBtnPm && !this.requestRangeBtnPm._eventBound) {
            this.requestRangeBtnPm.addEventListener('click', () => this.requestAddressRangePm());
            this.requestRangeBtnPm._eventBound = true;
        }
        
        // Bind events for AM8 autorequest checkbox
        if (this.autorequestCheckboxAm8) {
            this.autorequestCheckboxAm8.addEventListener('change', (e) => {
                this.autowriteEnabledAm8 = e.target.checked;
                this.logMessage(`AM8 Автозапрос ${this.autowriteEnabledAm8 ? 'включен' : 'отключен'}`);
            });
        }
        
        // Bind events for KL autorequest checkbox
        if (this.autorequestCheckboxKl) {
            this.autorequestCheckboxKl.addEventListener('change', (e) => {
                this.writeLogEnabled = e.target.checked;
                this.logMessage(`Автозапрос ${this.writeLogEnabled ? 'включен' : 'отключен'}`);
            });
        }
        
        // Bind events for sensor grid indicators
        this.bindSensorIndicatorEvents();
        
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

    bindSensorIndicatorEvents() {
        // Find all sensor indicators in the grid
        const indicators = document.querySelectorAll('.black-circle');
        
        indicators.forEach(indicator => {
            // Remove existing event listeners to prevent duplicates
            indicator.removeEventListener('click', this.handleIndicatorClick);
            
            // Add click event listener
            indicator.addEventListener('click', this.handleIndicatorClick.bind(this));
        });
    }

    handleIndicatorClick(event) {
        const indicator = event.target;
        
        // Define the cycle of states
        const states = ['state-black', 'state-red', 'state-green', 'state-blue'];
        
        // Get current state
        let currentState = '';
        states.forEach(state => {
            if (indicator.classList.contains(state)) {
                currentState = state;
            }
        });
        
        // Remove all state classes
        states.forEach(state => {
            indicator.classList.remove(state);
        });
        
        // Find next state
        const currentIndex = states.indexOf(currentState);
        const nextIndex = (currentIndex + 1) % states.length;
        const nextState = states[nextIndex];
        
        // Add new state class
        indicator.classList.add(nextState);
        
        // Optional: Log the change
        const blockNumber = indicator.closest('.sensor-block')?.querySelector('.block-number')?.textContent;
        console.log(`Block ${blockNumber}: Indicator state changed to ${nextState}`);
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

        // Action button events - moved to bindTabEvents() to avoid duplicates

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
            // Для датчиков СГ - "Состояние датчика"
            if (tabName === 'am1' || tabName === 'am8') {
                this.thirdColumnHeader.textContent = 'Состояние входа';
            } else if (tabName === 'pm') {
                this.thirdColumnHeader.textContent = 'Состояние реле';
            } else if (tabName === 'sensors') {
                this.thirdColumnHeader.textContent = 'Состояние датчика';
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
            } else if (this.currentTab === 'sensors') {
                activeButton = this.writeBtnSensors; // Sensors tab write button
            } else {
                activeButton = this.writeBtn;
            }
            
            if (activeButton) {
                this.showLoading(activeButton);
                activeButton.disabled = true;
            }

            // Handle AM8 autowrite logic
            if (this.currentTab === 'am8' && this.autowriteEnabledAm8) {
                // Start AM8 autowrite sequence
                this.currentAddressIndexAm8 = 0;
                this.performAm8Autowrite();
                if (activeButton) {
                    this.hideLoading(activeButton);
                    activeButton.disabled = false;
                }
                return; // Exit early for AM8 autowrite
            }
            
            // Handle PM address write logic
            if (this.currentTab === 'pm') {
                // Start PM address write sequence (4 addresses sequentially)
                this.currentAddressIndexPm = 0;
                this.performPmAddressWrite();
                if (activeButton) {
                    this.hideLoading(activeButton);
                    activeButton.disabled = false;
                }
                return; // Exit early for PM address write
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
            } else if (this.currentTab === 'sensors') {
                activeButton = this.writeBtnSensors; // Sensors tab write button
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

    async requestAddressRange() {
        if (!this.isConnected) {
            this.showToast('warning', 'Сначала подключитесь к устройству');
            return;
        }

        try {
            // Show loading on button
            if (this.requestRangeBtn) {
                this.showLoading(this.requestRangeBtn);
                this.requestRangeBtn.disabled = true;
            }

            // Get selected range
            const selectedRange = this.addressRangeSelect ? this.addressRangeSelect.value : '1';
            const startAddress = parseInt(selectedRange);
            
            // Create 5-byte request command
            const command = this.createAddressRangeRequest(startAddress);
            
            // Send command via IPC
            const result = await ipcRenderer.invoke('send-command', command);

            if (result.success) {
                this.showToast('success', `Запрос диапазона адресов ${startAddress}-${startAddress + 9} отправлен`);
                this.logMessage(`Запрос диапазона адресов: ${command}`);
                // Set flag to wait for 24-byte response
                this.waitingForRangeResponse = true;
                
                // Set timeout to reset button if no response received
                setTimeout(() => {
                    if (this.waitingForRangeResponse) {
                        this.waitingForRangeResponse = false;
                        if (this.requestRangeBtn) {
                            this.hideLoading(this.requestRangeBtn);
                            this.requestRangeBtn.disabled = false;
                        }
                        this.showToast('warning', 'Тайм-аут ожидания ответа от устройства');
                    }
                }, 10000); // 10 second timeout
                
            } else {
                this.showToast('error', 'Ошибка отправки запроса: ' + result.message);
                // Hide loading and enable button on error
                if (this.requestRangeBtn) {
                    this.hideLoading(this.requestRangeBtn);
                    this.requestRangeBtn.disabled = false;
                }
            }
        } catch (error) {
            this.showToast('error', 'Ошибка запроса диапазона: ' + error.message);
            // Hide loading and enable button on error
            if (this.requestRangeBtn) {
                this.hideLoading(this.requestRangeBtn);
                this.requestRangeBtn.disabled = false;
            }
        }
    }

    createAddressRangeRequest(startAddress) {
        // Create 5-byte command for address range request
        // Format: [Command Byte][Start Address][End Address][Checksum Low][Checksum High]
        
        const commandByte = 0x51; // Example command byte for address range request
        const endAddress = startAddress + 9;
        
        // Calculate checksum (simple XOR of first 3 bytes)
        const checksum = commandByte ^ (startAddress & 0xFF) ^ (endAddress & 0xFF);
        const checksumLow = checksum & 0xFF;
        const checksumHigh = (checksum >> 8) & 0xFF;
        
        // Create byte array
        const commandBytes = [
            commandByte,
            startAddress & 0xFF,
            endAddress & 0xFF,
            checksumLow,
            checksumHigh
        ];
        
        // Convert to hex string for transmission
        return commandBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async requestAddressRangeAm8() {
        if (!this.isConnected) {
            this.showToast('warning', 'Сначала подключитесь к устройству');
            return;
        }

        try {
            // Show loading on button
            if (this.requestRangeBtnAm8) {
                this.showLoading(this.requestRangeBtnAm8);
                this.requestRangeBtnAm8.disabled = true;
            }

            // Get start and end addresses from form fields
            const startAddress = this.am8StartAddress ? parseInt(this.am8StartAddress.value) : 1;
            const endAddress = this.am8EndAddress ? parseInt(this.am8EndAddress.value) : 8;
            
            // Validate addresses (must be 2 digits: 10-99)
            if (startAddress < 10 || startAddress > 99) {
                throw new Error('Начальный адрес должен быть двухзначным числом (10-99)');
            }
            
            if (endAddress < 10 || endAddress > 99) {
                throw new Error('Конечный адрес должен быть двухзначным числом (10-99)');
            }
            
            if (startAddress > endAddress) {
                throw new Error('Начальный адрес не может быть больше конечного');
            }
            
            // Create 5-byte request command
            const command = this.createAddressRangeRequestAm8(startAddress, endAddress);
            
            // Send command via IPC
            const result = await ipcRenderer.invoke('send-command', command);

            if (result.success) {
                this.showToast('success', `Запрос диапазона адресов ${startAddress}-${endAddress} отправлен`);
                this.logMessage(`Запрос диапазона адресов AM8: ${command}`);
                // Set flag to wait for response (AM8 specific)
                this.waitingForRangeResponseAm8 = true;
                
                // Set timeout to reset button if no response received
                setTimeout(() => {
                    if (this.waitingForRangeResponseAm8) {
                        this.waitingForRangeResponseAm8 = false;
                        if (this.requestRangeBtnAm8) {
                            this.hideLoading(this.requestRangeBtnAm8);
                            this.requestRangeBtnAm8.disabled = false;
                        }
                        this.showToast('warning', 'Тайм-аут ожидания ответа от устройства');
                    }
                }, 10000); // 10 second timeout
                
            } else {
                this.showToast('error', 'Ошибка отправки запроса: ' + result.message);
                // Hide loading and enable button on error
                if (this.requestRangeBtnAm8) {
                    this.hideLoading(this.requestRangeBtnAm8);
                    this.requestRangeBtnAm8.disabled = false;
                }
            }
        } catch (error) {
            this.showToast('error', 'Ошибка запроса диапазона: ' + error.message);
            // Hide loading and enable button on error
            if (this.requestRangeBtnAm8) {
                this.hideLoading(this.requestRangeBtnAm8);
                this.requestRangeBtnAm8.disabled = false;
            }
        }
    }

    createAddressRangeRequestAm8(startAddress, endAddress) {
        // Create 5-byte command for address range request (AM8 version)
        // Format: [Command Byte][Start Address][End Address][Checksum Low][Checksum High]
        
        const commandByte = 0x51; // Same command byte as AM1
        
        // Calculate checksum (simple XOR of first 3 bytes)
        const checksum = commandByte ^ (startAddress & 0xFF) ^ (endAddress & 0xFF);
        const checksumLow = checksum & 0xFF;
        const checksumHigh = (checksum >> 8) & 0xFF;
        
        // Create byte array
        const commandBytes = [
            commandByte,
            startAddress & 0xFF,
            endAddress & 0xFF,
            checksumLow,
            checksumHigh
        ];
        
        // Convert to hex string for transmission
        return commandBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async requestAddressRangePm() {
        if (!this.isConnected) {
            this.showToast('warning', 'Сначала подключитесь к устройству');
            return;
        }

        try {
            // Show loading on button
            if (this.requestRangeBtnPm) {
                this.showLoading(this.requestRangeBtnPm);
                this.requestRangeBtnPm.disabled = true;
            }

            // Get start and end addresses from form fields
            const startAddress = this.pmStartAddress ? parseInt(this.pmStartAddress.value) : 1;
            const endAddress = this.pmEndAddress ? parseInt(this.pmEndAddress.value) : 4;
            
            // Validate addresses (1-127)
            if (startAddress < 1 || startAddress > 127) {
                throw new Error('Начальный адрес должен быть в диапазоне от 1 до 127');
            }
            
            if (endAddress < 1 || endAddress > 127) {
                throw new Error('Конечный адрес должен быть в диапазоне от 1 до 127');
            }
            
            if (startAddress > endAddress) {
                throw new Error('Начальный адрес не может быть больше конечного');
            }
            
            // Create 5-byte request command
            const command = this.createAddressRangeRequestPm(startAddress, endAddress);
            
            // Send command via IPC
            const result = await ipcRenderer.invoke('send-command', command);

            if (result.success) {
                this.showToast('success', `Запрос диапазона адресов ${startAddress}-${endAddress} отправлен`);
                this.logMessage(`Запрос диапазона адресов PM: ${command}`);
                // Set flag to wait for response (PM specific)
                this.waitingForRangeResponsePm = true;
                
                // Set timeout to reset button if no response received
                setTimeout(() => {
                    if (this.waitingForRangeResponsePm) {
                        this.waitingForRangeResponsePm = false;
                        if (this.requestRangeBtnPm) {
                            this.hideLoading(this.requestRangeBtnPm);
                            this.requestRangeBtnPm.disabled = false;
                        }
                        this.showToast('warning', 'Тайм-аут ожидания ответа от устройства');
                    }
                }, 10000); // 10 second timeout
                
            } else {
                this.showToast('error', 'Ошибка отправки запроса: ' + result.message);
                // Hide loading and enable button on error
                if (this.requestRangeBtnPm) {
                    this.hideLoading(this.requestRangeBtnPm);
                    this.requestRangeBtnPm.disabled = false;
                }
            }
        } catch (error) {
            this.showToast('error', 'Ошибка запроса диапазона: ' + error.message);
            // Hide loading and enable button on error
            if (this.requestRangeBtnPm) {
                this.hideLoading(this.requestRangeBtnPm);
                this.requestRangeBtnPm.disabled = false;
            }
        }
    }

    createAddressRangeRequestPm(startAddress, endAddress) {
        // Create 5-byte command for address range request (PM version)
        // Format: [Command Byte][Start Address][End Address][Checksum Low][Checksum High]
        
        const commandByte = 0x53; // Command byte for PM address range request
        
        // Calculate checksum (simple XOR of first 3 bytes)
        const checksum = commandByte ^ (startAddress & 0xFF) ^ (endAddress & 0xFF);
        const checksumLow = checksum & 0xFF;
        const checksumHigh = (checksum >> 8) & 0xFF;
        
        // Create byte array
        const commandBytes = [
            commandByte,
            startAddress & 0xFF,
            endAddress & 0xFF,
            checksumLow,
            checksumHigh
        ];
        
        // Convert to hex string for transmission
        return commandBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    parseAddressRangeResponse(responseData) {
        // Parse 24-byte response containing: Address, Power Status, Input Status
        // Expected format: 24 bytes of hex data or raw binary data
        try {
            let bytes = [];
            
            // Check if data is already in hex string format
            if (typeof responseData === 'string') {
                // Remove any whitespace, separators and convert to uppercase
                const cleanData = responseData.replace(/[\s\-:]/g, '').toUpperCase();
                
                // Check if it's valid hex
                if (/^[0-9A-F]+$/.test(cleanData)) {
                    // Check if we have 24 bytes (48 hex characters)
                    if (cleanData.length !== 48) {
                        throw new Error(`Invalid hex response length: expected 48 hex characters, got ${cleanData.length}`);
                    }
                    
                    // Parse hex string to bytes
                    for (let i = 0; i < 48; i += 2) {
                        const hexByte = cleanData.substr(i, 2);
                        bytes.push(parseInt(hexByte, 16));
                    }
                } else {
                    // Try to parse as space-separated bytes or other format
                    const parts = responseData.trim().split(/\s+/);
                    bytes = parts.map(part => {
                        const num = parseInt(part, 16);
                        if (isNaN(num)) throw new Error(`Invalid hex byte: ${part}`);
                        return num;
                    });
                    
                    if (bytes.length !== 24) {
                        throw new Error(`Invalid response length: expected 24 bytes, got ${bytes.length}`);
                    }
                }
            } else if (Array.isArray(responseData)) {
                // Data is already array of bytes
                bytes = responseData;
                if (bytes.length !== 24) {
                    throw new Error(`Invalid response length: expected 24 bytes, got ${bytes.length}`);
                }
            } else {
                throw new Error('Unsupported response data format');
            }

            // Extract information based on protocol
            // Protocol format: [Address][PowerStatus][InputStatus][...other data...]
            const deviceInfo = {
                address: bytes[0], // First byte: device address (1-247)
                powerStatus: bytes[1], // Second byte: power status (0=off, 1=on)
                inputStatus: bytes[2], // Third byte: input status (0=open, 1=closed, 2=no data)
                rawData: bytes
            };

            // Validate address range
            if (deviceInfo.address < 1 || deviceInfo.address > 247) {
                throw new Error(`Invalid device address: ${deviceInfo.address}`);
            }

            return deviceInfo;
        } catch (error) {
            console.error('Error parsing address range response:', error);
            console.error('Response data:', responseData);
            throw new Error('Failed to parse device response: ' + error.message);
        }
    }

    parseAddressRangeResponseAm8(responseData) {
        // Parse AM8 response containing: 8 addresses, power status, 9 inputs
        // Expected format: longer response with device information for AM8
        try {
            let bytes = [];
            
            // Check if data is already in hex string format
            if (typeof responseData === 'string') {
                // Remove any whitespace, separators and convert to uppercase
                const cleanData = responseData.replace(/[\s\-:]/g, '').toUpperCase();
                
                // Check if it's valid hex
                if (/^[0-9A-F]+$/.test(cleanData)) {
                    // Parse hex string to bytes
                    for (let i = 0; i < cleanData.length; i += 2) {
                        const hexByte = cleanData.substr(i, 2);
                        bytes.push(parseInt(hexByte, 16));
                    }
                } else {
                    // Try to parse as space-separated bytes or other format
                    const parts = responseData.trim().split(/\s+/);
                    bytes = parts.map(part => {
                        const num = parseInt(part, 16);
                        if (isNaN(num)) throw new Error(`Invalid hex byte: ${part}`);
                        return num;
                    });
                }
            } else if (Array.isArray(responseData)) {
                bytes = responseData;
            } else {
                throw new Error('Unsupported response data format');
            }

            // AM8 response structure (assuming):
            // Bytes 0-7: 8 addresses on device
            // Byte 8: Power status
            // Bytes 9-17: 9 input statuses
            
            if (bytes.length < 18) {
                throw new Error(`Invalid AM8 response length: expected at least 18 bytes, got ${bytes.length}`);
            }

            const am8DeviceInfo = {
                addresses: bytes.slice(0, 8), // First 8 bytes: addresses (1-247)
                powerStatus: bytes[8], // Byte 8: power status (0=off, 1=on)
                inputs: bytes.slice(9, 18), // Bytes 9-17: 9 input statuses (0=open, 1=closed, 2=no data)
                rawData: bytes
            };

            // Validate addresses
            for (let i = 0; i < am8DeviceInfo.addresses.length; i++) {
                if (am8DeviceInfo.addresses[i] < 1 || am8DeviceInfo.addresses[i] > 247) {
                    console.warn(`Invalid address at position ${i}: ${am8DeviceInfo.addresses[i]}`);
                }
            }

            return am8DeviceInfo;
        } catch (error) {
            console.error('Error parsing AM8 address range response:', error);
            console.error('Response data:', responseData);
            throw new Error('Failed to parse AM8 device response: ' + error.message);
        }
    }

    parseAddressRangeResponsePm(responseData) {
        // Parse PM response containing: 4 addresses, power status, relay status
        // Expected format: 24-byte response with device information for PM
        try {
            let bytes = [];
            
            // Check if data is already in hex string format
            if (typeof responseData === 'string') {
                // Remove any whitespace, separators and convert to uppercase
                const cleanData = responseData.replace(/[\s\-:]/g, '').toUpperCase();
                
                // Check if it's valid hex
                if (/^[0-9A-F]+$/.test(cleanData)) {
                    // Check if we have 24 bytes (48 hex characters)
                    if (cleanData.length !== 48) {
                        throw new Error(`Invalid PM hex response length: expected 48 hex characters, got ${cleanData.length}`);
                    }
                    
                    // Parse hex string to bytes
                    for (let i = 0; i < 48; i += 2) {
                        const hexByte = cleanData.substr(i, 2);
                        bytes.push(parseInt(hexByte, 16));
                    }
                } else {
                    // Try to parse as space-separated bytes or other format
                    const parts = responseData.trim().split(/\s+/);
                    bytes = parts.map(part => {
                        const num = parseInt(part, 16);
                        if (isNaN(num)) throw new Error(`Invalid hex byte: ${part}`);
                        return num;
                    });
                    
                    if (bytes.length !== 24) {
                        throw new Error(`Invalid PM response length: expected 24 bytes, got ${bytes.length}`);
                    }
                }
            } else if (Array.isArray(responseData)) {
                // Data is already array of bytes
                bytes = responseData;
                if (bytes.length !== 24) {
                    throw new Error(`Invalid PM response length: expected 24 bytes, got ${bytes.length}`);
                }
            } else {
                throw new Error('Unsupported PM response data format');
            }

            // PM response structure (24 bytes):
            // Bytes 0-3: 4 addresses on device (1-247)
            // Byte 4: Power status (0=off, 1=on)
            // Bytes 5-8: 4 relay statuses (0=open, 1=closed, 2=no data)
            // Bytes 9-23: Reserved/extended data
            
            const pmDeviceInfo = {
                addresses: bytes.slice(0, 4), // First 4 bytes: addresses (1-247)
                powerStatus: bytes[4], // Byte 4: power status (0=off, 1=on)
                relayStatuses: bytes.slice(5, 9), // Bytes 5-8: 4 relay statuses
                rawData: bytes
            };

            // Validate addresses
            for (let i = 0; i < pmDeviceInfo.addresses.length; i++) {
                if (pmDeviceInfo.addresses[i] < 1 || pmDeviceInfo.addresses[i] > 247) {
                    console.warn(`Invalid PM address at position ${i}: ${pmDeviceInfo.addresses[i]}`);
                }
            }

            return pmDeviceInfo;
        } catch (error) {
            console.error('Error parsing PM address range response:', error);
            console.error('Response data:', responseData);
            throw new Error('Failed to parse PM device response: ' + error.message);
        }
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

    updateTestResultRow(address, deviceInfo) {
        // Find the row for the specific address and update it with device information
        const rows = this.testResults.querySelectorAll('.table-row.am1-only');
        
        for (const row of rows) {
            const addressCell = row.querySelector('.table-cell:first-child');
            if (addressCell && parseInt(addressCell.textContent) === address) {
                // Update address cell if needed
                addressCell.textContent = deviceInfo.address;
                
                // Update power status
                const powerStatus = row.querySelector('.table-cell:nth-child(2) .status-indicator');
                if (powerStatus) {
                    if (deviceInfo.powerStatus === 1) {
                        powerStatus.className = 'status-indicator online';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                    } else {
                        powerStatus.className = 'status-indicator offline';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                    }
                }
                
                // Update input status
                const inputStatus = row.querySelector('.table-cell:nth-child(3) .input-status-indicator');
                if (inputStatus) {
                    if (deviceInfo.inputStatus === 0) {
                        inputStatus.className = 'input-status-indicator open';
                    } else if (deviceInfo.inputStatus === 1) {
                        inputStatus.className = 'input-status-indicator closed';
                    } else {
                        inputStatus.className = 'input-status-indicator no-data';
                    }
                }
                
                return true; // Row updated successfully
            }
        }
        
        // If row not found, create a new one (this shouldn't normally happen for AM1)
        // But we'll handle it gracefully by updating the existing row with address 1
        if (this.currentTab === 'am1') {
            const firstRow = this.testResults.querySelector('.table-row.am1-only');
            if (firstRow) {
                const addressCell = firstRow.querySelector('.table-cell:first-child');
                if (addressCell && parseInt(addressCell.textContent) === 1) {
                    // Update the first row with the found device info
                    addressCell.textContent = deviceInfo.address;
                    
                    // Update power status
                    const powerStatus = firstRow.querySelector('.table-cell:nth-child(2) .status-indicator');
                    if (powerStatus) {
                        if (deviceInfo.powerStatus === 1) {
                            powerStatus.className = 'status-indicator online';
                            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                        } else {
                            powerStatus.className = 'status-indicator offline';
                            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                        }
                    }
                    
                    // Update input status
                    const inputStatus = firstRow.querySelector('.table-cell:nth-child(3) .input-status-indicator');
                    if (inputStatus) {
                        if (deviceInfo.inputStatus === 0) {
                            inputStatus.className = 'input-status-indicator open';
                        } else if (deviceInfo.inputStatus === 1) {
                            inputStatus.className = 'input-status-indicator closed';
                        } else {
                            inputStatus.className = 'input-status-indicator no-data';
                        }
                    }
                    
                    return true; // Row updated successfully
                }
            }
        }
        
        return false; // Row not found
    }

    updateTestResultRowAm8(address, deviceInfo) {
        // Find the row for the specific address and update it with device information for AM8
        const rows = this.testResults.querySelectorAll('.table-row.am8-only');
        
        for (const row of rows) {
            const addressCell = row.querySelector('.table-cell:first-child');
            if (addressCell && parseInt(addressCell.textContent) === address) {
                // Update address cell if needed
                addressCell.textContent = deviceInfo.address;
                
                // Update power status
                const powerStatus = row.querySelector('.table-cell:nth-child(2) .status-indicator');
                if (powerStatus) {
                    if (deviceInfo.powerStatus === 1) {
                        powerStatus.className = 'status-indicator online';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                    } else {
                        powerStatus.className = 'status-indicator offline';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                    }
                }
                
                // Update input status
                const inputStatus = row.querySelector('.table-cell:nth-child(3) .input-status-indicator');
                if (inputStatus) {
                    if (deviceInfo.inputStatus === 0) {
                        inputStatus.className = 'input-status-indicator open';
                    } else if (deviceInfo.inputStatus === 1) {
                        inputStatus.className = 'input-status-indicator closed';
                    } else {
                        inputStatus.className = 'input-status-indicator no-data';
                    }
                }
                
                return true; // Row updated successfully
            }
        }
        
        // If row not found, update the first AM8 row with the found device info
        if (this.currentTab === 'am8') {
            const firstRow = this.testResults.querySelector('.table-row.am8-only');
            if (firstRow) {
                const addressCell = firstRow.querySelector('.table-cell:first-child');
                if (addressCell) {
                    // Update the first row with the found device info
                    addressCell.textContent = deviceInfo.address;
                    
                    // Update power status
                    const powerStatus = firstRow.querySelector('.table-cell:nth-child(2) .status-indicator');
                    if (powerStatus) {
                        if (deviceInfo.powerStatus === 1) {
                            powerStatus.className = 'status-indicator online';
                            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                        } else {
                            powerStatus.className = 'status-indicator offline';
                            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                        }
                    }
                    
                    // Update input status
                    const inputStatus = firstRow.querySelector('.table-cell:nth-child(3) .input-status-indicator');
                    if (inputStatus) {
                        if (deviceInfo.inputStatus === 0) {
                            inputStatus.className = 'input-status-indicator open';
                        } else if (deviceInfo.inputStatus === 1) {
                            inputStatus.className = 'input-status-indicator closed';
                        } else {
                            inputStatus.className = 'input-status-indicator no-data';
                        }
                    }
                    
                    return true; // Row updated successfully
                }
            }
        }
        
        return false; // Row not found
    }

    updateTestResultRowPm(address, deviceInfo) {
        // Find the row for the specific address and update it with device information for PM
        const rows = this.testResults.querySelectorAll('.table-row.pm-only');
        
        for (const row of rows) {
            const addressCell = row.querySelector('.table-cell:first-child');
            if (addressCell && parseInt(addressCell.textContent) === address) {
                // Update address cell if needed
                addressCell.textContent = deviceInfo.address;
                
                // Update power status
                const powerStatus = row.querySelector('.table-cell:nth-child(2) .status-indicator');
                if (powerStatus) {
                    if (deviceInfo.powerStatus === 1) {
                        powerStatus.className = 'status-indicator online';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                    } else {
                        powerStatus.className = 'status-indicator offline';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                    }
                }
                
                // Update relay status (PM uses relay-status-indicator instead of input-status-indicator)
                const relayStatus = row.querySelector('.table-cell:nth-child(3) .relay-status-indicator');
                if (relayStatus) {
                    if (deviceInfo.inputStatus === 0) {
                        relayStatus.className = 'relay-status-indicator open';
                    } else if (deviceInfo.inputStatus === 1) {
                        relayStatus.className = 'relay-status-indicator closed';
                    } else {
                        relayStatus.className = 'relay-status-indicator no-data';
                    }
                }
                
                return true; // Row updated successfully
            }
        }
        
        // If row not found, update the first PM row with the found device info
        if (this.currentTab === 'pm') {
            const firstRow = this.testResults.querySelector('.table-row.pm-only');
            if (firstRow) {
                const addressCell = firstRow.querySelector('.table-cell:first-child');
                if (addressCell) {
                    // Update the first row with the found device info
                    addressCell.textContent = deviceInfo.address;
                    
                    // Update power status
                    const powerStatus = firstRow.querySelector('.table-cell:nth-child(2) .status-indicator');
                    if (powerStatus) {
                        if (deviceInfo.powerStatus === 1) {
                            powerStatus.className = 'status-indicator online';
                            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                        } else {
                            powerStatus.className = 'status-indicator offline';
                            powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                        }
                    }
                    
                    // Update relay status
                    const relayStatus = firstRow.querySelector('.table-cell:nth-child(3) .relay-status-indicator');
                    if (relayStatus) {
                        if (deviceInfo.inputStatus === 0) {
                            relayStatus.className = 'relay-status-indicator open';
                        } else if (deviceInfo.inputStatus === 1) {
                            relayStatus.className = 'relay-status-indicator closed';
                        } else {
                            relayStatus.className = 'relay-status-indicator no-data';
                        }
                    }
                    
                    return true; // Row updated successfully
                }
            }
        }
        
        return false; // Row not found
    }

    updateTestResultTableAm8(am8DeviceInfo) {
        // Update AM8 test results table with all 8 addresses, power status and 9 inputs
        const rows = this.testResults.querySelectorAll('.table-row.am8-only');
        
        // Update each row with corresponding address data
        for (let i = 0; i < Math.min(rows.length, 8); i++) {
            const row = rows[i];
            const addressCell = row.querySelector('.table-cell:first-child');
            
            if (addressCell && am8DeviceInfo.addresses[i]) {
                // Update address
                addressCell.textContent = am8DeviceInfo.addresses[i];
                
                // Update power status (same for all addresses)
                const powerStatus = row.querySelector('.table-cell:nth-child(2) .status-indicator');
                if (powerStatus) {
                    if (am8DeviceInfo.powerStatus === 1) {
                        powerStatus.className = 'status-indicator online';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                    } else {
                        powerStatus.className = 'status-indicator offline';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                    }
                }
                
                // Update input status (use corresponding input for this address)
                const inputStatus = row.querySelector('.table-cell:nth-child(3) .input-status-indicator');
                if (inputStatus && am8DeviceInfo.inputs[i]) {
                    const inputValue = am8DeviceInfo.inputs[i];
                    if (inputValue === 0) {
                        inputStatus.className = 'input-status-indicator open';
                    } else if (inputValue === 1) {
                        inputStatus.className = 'input-status-indicator closed';
                    } else {
                        inputStatus.className = 'input-status-indicator no-data';
                    }
                }
            }
        }
    }

    updateTestResultTablePm(pmDeviceInfo) {
        // Update PM test results table with all 4 addresses, power status and 4 relay statuses
        const rows = this.testResults.querySelectorAll('.table-row.pm-only');
        
        // Update each row with corresponding address data
        for (let i = 0; i < Math.min(rows.length, 4); i++) {
            const row = rows[i];
            const addressCell = row.querySelector('.table-cell:first-child');
            
            if (addressCell && pmDeviceInfo.addresses[i]) {
                // Update address
                addressCell.textContent = pmDeviceInfo.addresses[i];
                
                // Update power status (same for all addresses)
                const powerStatus = row.querySelector('.table-cell:nth-child(2) .status-indicator');
                if (powerStatus) {
                    if (pmDeviceInfo.powerStatus === 1) {
                        powerStatus.className = 'status-indicator online';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Подключено';
                    } else {
                        powerStatus.className = 'status-indicator offline';
                        powerStatus.innerHTML = '<i class="fas fa-power-off"></i> Отключено';
                    }
                }
                
                // Update relay status (use corresponding relay for this address)
                const relayStatus = row.querySelector('.table-cell:nth-child(3) .relay-status-indicator');
                if (relayStatus && pmDeviceInfo.relayStatuses[i] !== undefined) {
                    const relayValue = pmDeviceInfo.relayStatuses[i];
                    if (relayValue === 0) {
                        relayStatus.className = 'relay-status-indicator open';
                    } else if (relayValue === 1) {
                        relayStatus.className = 'relay-status-indicator closed';
                    } else {
                        relayStatus.className = 'relay-status-indicator no-data';
                    }
                }
            }
        }
    }

    async writeAddressAm8(addressIndex) {
        // Write single address for AM8 autowrite mode
        if (!this.isConnected) {
            this.showToast('warning', 'Сначала подключитесь к устройству');
            return false;
        }

        try {
            // Get address from corresponding input field
            const addressInputs = [
                'address1-am8', 'address2', 'address3', 'address4', 
                'address5', 'address6', 'address7', 'address8'
            ];
            
            const addressInputId = addressInputs[addressIndex];
            const addressInput = document.getElementById(addressInputId);
            
            if (!addressInput) {
                throw new Error(`Address input field ${addressInputId} not found`);
            }
            
            const newAddress = parseInt(addressInput.value);
            if (isNaN(newAddress) || newAddress < 1 || newAddress > 247) {
                throw new Error(`Invalid address: ${newAddress}`);
            }
            
            // Create write command for this address
            const command = this.createWriteAddressCommandAm8(addressIndex, newAddress);
            
            // Send command via IPC
            const result = await ipcRenderer.invoke('send-command', command);
            
            if (result.success) {
                this.logMessage(`AM8: Запись адреса ${newAddress} в позицию ${addressIndex + 1} отправлена`);
                return true;
            } else {
                this.showToast('error', `Ошибка записи адреса ${newAddress}: ${result.message}`);
                return false;
            }
            
        } catch (error) {
            this.showToast('error', `Ошибка записи адреса: ${error.message}`);
            return false;
        }
    }

    createWriteAddressCommandAm8(addressIndex, newAddress) {
        // Create 5-byte command for writing single address in AM8
        // Format: [Command Byte][Address Index][New Address][Checksum Low][Checksum High]
        
        const commandByte = 0x52; // Command byte for AM8 address write
        
        // Calculate checksum (simple XOR of first 3 bytes)
        const checksum = commandByte ^ (addressIndex & 0xFF) ^ (newAddress & 0xFF);
        const checksumLow = checksum & 0xFF;
        const checksumHigh = (checksum >> 8) & 0xFF;
        
        // Create byte array
        const commandBytes = [
            commandByte,
            addressIndex & 0xFF,
            newAddress & 0xFF,
            checksumLow,
            checksumHigh
        ];
        
        // Convert to hex string for transmission
        return commandBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async performAm8Autowrite() {
        // Perform sequential write of all 8 addresses for AM8
        if (this.currentAddressIndexAm8 >= 8) {
            // All addresses written, finish autowrite
            this.showToast('success', 'AM8: Все адреса записаны');
            this.autowriteEnabledAm8 = false;
            this.currentAddressIndexAm8 = 0;
            if (this.autorequestCheckboxAm8) {
                this.autorequestCheckboxAm8.checked = false;
            }
            return;
        }
        
        try {
            const success = await this.writeAddressAm8(this.currentAddressIndexAm8);
            
            if (success) {
                this.currentAddressIndexAm8++;
                // Wait a bit before next write (500ms)
                setTimeout(() => {
                    if (this.autowriteEnabledAm8) {
                        this.performAm8Autowrite();
                    }
                }, 500);
            } else {
                // Error occurred, stop autowrite
                this.autowriteEnabledAm8 = false;
                this.currentAddressIndexAm8 = 0;
                if (this.autorequestCheckboxAm8) {
                    this.autorequestCheckboxAm8.checked = false;
                }
            }
            
        } catch (error) {
            this.showToast('error', `Ошибка автозаписи AM8: ${error.message}`);
            this.autowriteEnabledAm8 = false;
            this.currentAddressIndexAm8 = 0;
            if (this.autorequestCheckboxAm8) {
                this.autorequestCheckboxAm8.checked = false;
            }
        }
    }

    async writeAddressPm(addressIndex) {
        // Write single address for PM (4 addresses, index 0-3)
        if (!this.isConnected) {
            this.showToast('warning', 'Сначала подключитесь к устройству');
            return false;
        }

        try {
            // Get address from corresponding input field
            const addressInputs = ['pm-address1', 'pm-address2', 'pm-address3', 'pm-address4'];
            
            const addressInputId = addressInputs[addressIndex];
            const addressInput = document.getElementById(addressInputId);
            
            if (!addressInput) {
                throw new Error(`PM address input field ${addressInputId} not found`);
            }
            
            const newAddress = parseInt(addressInput.value);
            if (isNaN(newAddress) || newAddress < 1 || newAddress > 247) {
                throw new Error(`Invalid PM address: ${newAddress}`);
            }
            
            // Create write command for this address
            const command = this.createWriteAddressCommandPm(addressIndex, newAddress);
            
            // Send command via IPC
            const result = await ipcRenderer.invoke('send-command', command);
            
            if (result.success) {
                this.logMessage(`PM: Запись адреса ${newAddress} в позицию ${addressIndex + 1} отправлена`);
                // Set flag to wait for response from device with new address
                this.waitingForPmWriteResponse = true;
                return true;
            } else {
                this.showToast('error', `Ошибка записи адреса ${newAddress}: ${result.message}`);
                return false;
            }
            
        } catch (error) {
            this.showToast('error', `Ошибка записи адреса PM: ${error.message}`);
            return false;
        }
    }

    createWriteAddressCommandPm(addressIndex, newAddress) {
        // Create 5-byte command for writing single address in PM
        // Format: [Command Byte][Address Index][New Address][Checksum Low][Checksum High]
        
        const commandByte = 0x54; // Command byte for PM address write
        
        // Calculate checksum (simple XOR of first 3 bytes)
        const checksum = commandByte ^ (addressIndex & 0xFF) ^ (newAddress & 0xFF);
        const checksumLow = checksum & 0xFF;
        const checksumHigh = (checksum >> 8) & 0xFF;
        
        // Create byte array
        const commandBytes = [
            commandByte,
            addressIndex & 0xFF,
            newAddress & 0xFF,
            checksumLow,
            checksumHigh
        ];
        
        // Convert to hex string for transmission
        return commandBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async performPmAddressWrite() {
        // Perform sequential write of all 4 addresses for PM
        if (this.currentAddressIndexPm >= 4) {
            // All addresses written, finish PM address write
            this.showToast('success', 'PM: Все адреса записаны');
            this.currentAddressIndexPm = 0;
            return;
        }
        
        try {
            const success = await this.writeAddressPm(this.currentAddressIndexPm);
            
            if (success) {
                this.currentAddressIndexPm++;
                // Wait a bit before next write (500ms interval as requested)
                setTimeout(() => {
                    this.performPmAddressWrite();
                }, 500);
            } else {
                // Error occurred, stop PM address write
                this.currentAddressIndexPm = 0;
            }
            
        } catch (error) {
            this.showToast('error', `Ошибка записи адресов PM: ${error.message}`);
            this.currentAddressIndexPm = 0;
        }
    }

    handleSerialData(data) {
        this.logMessage(`Получено: ${data}`);
        
        // Check if we're waiting for address range response (AM1)
        if (this.waitingForRangeResponse) {
            try {
                // Parse the 24-byte response
                const deviceInfo = this.parseAddressRangeResponse(data);
                
                // Update the test results table
                const updated = this.updateTestResultRow(deviceInfo.address, deviceInfo);
                
                if (updated) {
                    this.showToast('success', `Найдено устройство с адресом ${deviceInfo.address}`);
                    this.logMessage(`Device found - Address: ${deviceInfo.address}, Power: ${deviceInfo.powerStatus}, Input: ${deviceInfo.inputStatus}`);
                } else {
                    this.showToast('warning', `Получен ответ от устройства ${deviceInfo.address}, но строка в таблице не найдена`);
                }
                
                // Reset waiting flag and enable button
                this.waitingForRangeResponse = false;
                if (this.requestRangeBtn) {
                    this.hideLoading(this.requestRangeBtn);
                    this.requestRangeBtn.disabled = false;
                }
                
            } catch (error) {
                this.showToast('error', 'Ошибка обработки ответа: ' + error.message);
                this.waitingForRangeResponse = false;
                if (this.requestRangeBtn) {
                    this.hideLoading(this.requestRangeBtn);
                    this.requestRangeBtn.disabled = false;
                }
            }
        }
        // Check if we're waiting for address range response (AM8)
        else if (this.waitingForRangeResponseAm8) {
            try {
                // Parse the response for AM8 (8 addresses, power, 9 inputs)
                const am8DeviceInfo = this.parseAddressRangeResponseAm8(data);
                
                // Update the test results table for AM8 with all 8 addresses
                this.updateTestResultTableAm8(am8DeviceInfo);
                
                this.showToast('success', `AM8: Получена информация об устройстве`);
                this.logMessage(`AM8 - Found device with addresses: ${am8DeviceInfo.addresses.join(', ')}, Power: ${am8DeviceInfo.powerStatus}, Inputs: ${am8DeviceInfo.inputs.join(', ')}`);
                
                // Reset waiting flag and enable button
                this.waitingForRangeResponseAm8 = false;
                if (this.requestRangeBtnAm8) {
                    this.hideLoading(this.requestRangeBtnAm8);
                    this.requestRangeBtnAm8.disabled = false;
                }
                
            } catch (error) {
                this.showToast('error', 'AM8: Ошибка обработки ответа: ' + error.message);
                this.waitingForRangeResponseAm8 = false;
                if (this.requestRangeBtnAm8) {
                    this.hideLoading(this.requestRangeBtnAm8);
                    this.requestRangeBtnAm8.disabled = false;
                }
            }
        }
        // Check if we're waiting for address range response (PM)
        else if (this.waitingForRangeResponsePm) {
            try {
                // Parse the response for PM (24-byte response with 4 addresses, power, relay status)
                const pmDeviceInfo = this.parseAddressRangeResponsePm(data);
                
                // Update the test results table for PM with all 4 addresses
                this.updateTestResultTablePm(pmDeviceInfo);
                
                this.showToast('success', `PM: Получена информация об устройстве`);
                this.logMessage(`PM - Found device with addresses: ${pmDeviceInfo.addresses.join(', ')}, Power: ${pmDeviceInfo.powerStatus}, Relays: ${pmDeviceInfo.relayStatuses.join(', ')}`);
                
                // Reset waiting flag and enable button
                this.waitingForRangeResponsePm = false;
                if (this.requestRangeBtnPm) {
                    this.hideLoading(this.requestRangeBtnPm);
                    this.requestRangeBtnPm.disabled = false;
                }
                
            } catch (error) {
                this.showToast('error', 'PM: Ошибка обработки ответа: ' + error.message);
                this.waitingForRangeResponsePm = false;
                if (this.requestRangeBtnPm) {
                    this.hideLoading(this.requestRangeBtnPm);
                    this.requestRangeBtnPm.disabled = false;
                }
            }
        }
        // Check if we're waiting for PM address write response
        else if (this.waitingForPmWriteResponse) {
            try {
                // Parse the response for PM (24-byte response with updated addresses)
                const pmDeviceInfo = this.parseAddressRangeResponsePm(data);
                
                // Update the test results table for PM with new addresses
                this.updateTestResultTablePm(pmDeviceInfo);
                
                this.showToast('success', `PM: Адрес обновлен`);
                this.logMessage(`PM - Address updated: ${pmDeviceInfo.addresses.join(', ')}`);
                
                // Reset waiting flag
                this.waitingForPmWriteResponse = false;
                
            } catch (error) {
                this.showToast('error', 'PM: Ошибка обработки ответа записи: ' + error.message);
                this.waitingForPmWriteResponse = false;
            }
        } else {
            // Regular response handling
            if (data.includes('OK')) {
                this.showToast('success', 'Команда выполнена успешно');
            } else if (data.includes('ERROR')) {
                this.showToast('error', 'Ошибка выполнения команды');
            }
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
