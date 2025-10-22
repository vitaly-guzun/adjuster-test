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

    async loadTabWithContext(tabName, previousTab = null) {
        try {
            // Special handling for MOK tab - independent page template
            if (tabName === 'mok') {
                await this.loadMokTab(previousTab);
                return;
            }
            
            // Show loading indicator
            this.showTabLoading();
            
            // Check if tab is already loaded
            if (this.loadedTabs.has(tabName)) {
                this.displayTab(tabName, previousTab);
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
            
            // Display the tab with context
            this.displayTab(tabName, previousTab);
            
        } catch (error) {
            console.error(`Error loading tab ${tabName}:`, error);
            this.showTabError(tabName, error.message);
        }
    }

    async loadTab(tabName) {
        try {
            // Special handling for MOK tab - independent page template
            if (tabName === 'mok') {
                await this.loadMokTab();
                return;
            }
            
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
    
    displayTab(tabName, previousTab = null) {
        const tabData = this.loadedTabs.get(tabName);
        if (!tabData) return;
        
        // If switching away from MOK, clean up MOK-specific elements
        const wasMokTab = previousTab === 'mok' || this.currentTab === 'mok';
        if (wasMokTab && tabName !== 'mok') {
            this.showOtherSectionsAfterMok();
        }
        
        // Clear current content
        this.tabContent.innerHTML = '';
        
        // Remove any existing tab styles before loading new tab
        const existingTabStyles = document.querySelectorAll('style[data-tab]');
        existingTabStyles.forEach(style => style.remove());
        
        // Remove any existing MOK page styles
        const existingMokStyles = document.getElementById('mok-page-styles');
        if (existingMokStyles) {
            existingMokStyles.remove();
        }
        
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
    
    async loadMokTab(previousTab = null) {
        try {
            // Show loading indicator
            this.showTabLoading();
            
            // Load the independent MOK page template
            const htmlResponse = await fetch('tabs/mok.html');
            if (!htmlResponse.ok) {
                throw new Error('Failed to load MOK page template');
            }
            const htmlContent = await htmlResponse.text();
            
            // Load MOK-specific CSS
            const cssResponse = await fetch('tabs/mok.css');
            if (!cssResponse.ok) {
                throw new Error('Failed to load MOK CSS');
            }
            const cssContent = await cssResponse.text();
            
            // Clear the entire tab content area and replace with MOK page
            this.tabContent.innerHTML = '';
            
            // Remove any existing tab styles before loading MOK
            const existingTabStyles = document.querySelectorAll('style[data-tab]');
            existingTabStyles.forEach(style => style.remove());
            
            // Create a full-page container for MOK
            const mokPageContainer = document.createElement('div');
            mokPageContainer.className = 'mok-full-page';
            mokPageContainer.innerHTML = htmlContent;
            
            // Hide other sections when MOK is active
            this.hideOtherSectionsForMok();
            
            // Add CSS styles for MOK
            const styleElement = document.createElement('style');
            styleElement.textContent = cssContent;
            styleElement.setAttribute('data-tab', 'mok');
            styleElement.id = 'mok-page-styles';
            
            // Remove existing MOK styles if any
            const existingMokStyles = document.getElementById('mok-page-styles');
            if (existingMokStyles) {
                existingMokStyles.remove();
            }
            document.head.appendChild(styleElement);
            
            // Append MOK page content
            this.tabContent.appendChild(mokPageContainer);
            
            // Update current tab
            this.currentTab = 'mok';
            
            // Find and activate the MOK tab panel
            const mokPanel = mokPageContainer.querySelector('.tab-panel');
            if (mokPanel) {
                mokPanel.classList.add('active');
                mokPanel.style.display = 'block'; // Force display as fallback
                console.log('MOK panel found and activated');
                console.log('Panel classes:', mokPanel.className);
                console.log('Panel display style:', mokPanel.style.display);
            } else {
                console.log('MOK panel not found in loaded content');
                console.log('Container content:', mokPageContainer.innerHTML.substring(0, 200));
            }
            
            // Update body class for MOK
            this.updateBodyClass('mok');
            
            // Initialize MOK-specific elements after DOM is ready
            setTimeout(() => {
                this.initializeMokElements();
                console.log('MOK elements initialized');
            }, 10);
            
            console.log('MOK tab loaded successfully');
            
        } catch (error) {
            console.error('Error loading MOK tab:', error);
            this.showTabError('mok', error.message);
        }
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
    
    initializeMokElements() {
        // Initialize MOK-specific elements when MOK tab is loaded
        // This function will handle all MOK-related element initialization
        
        // Clear any existing MOK elements references
        this.mokStartScanBtn = null;
        this.mokAddressIndicators = null;
        this.mokAddressTree = null;
        this.mokFoundCount = null;
        this.mokArrowLeftBtn = null;
        this.mokArrowRightBtn = null;
        this.mokAddAddressesBtn = null;
        this.mokClearAssignmentsBtn = null;
        this.mokImportConfigBtn = null;
        this.mokExportConfigBtn = null;
        this.mokCreateSectionBtn = null;
        this.mokDeleteSectionBtn = null;
        this.mokWriteConfigBtn = null;
        this.mokClearConfigBtn = null;
        this.mokScanBlock = null;
        
        // Initialize MOK scan elements
        this.mokStartScanBtn = document.getElementById('mok-start-scan');
        this.mokAddressIndicators = document.getElementById('mokAddressIndicators');
        this.mokAddressTree = document.getElementById('mokAddressTree');
        this.mokFoundCount = document.getElementById('mokFoundCount');
        this.mokArrowLeftBtn = document.getElementById('mok-arrow-left');
        this.mokArrowRightBtn = document.getElementById('mok-arrow-right');
        this.mokAddAddressesBtn = document.getElementById('mok-add-addresses');
        this.mokClearAssignmentsBtn = document.getElementById('mok-clear-assignments');
        this.mokImportConfigBtn = document.getElementById('mok-import-config');
        this.mokExportConfigBtn = document.getElementById('mok-export-config');
        this.mokCreateSectionBtn = document.getElementById('mok-create-section');
        this.mokDeleteSectionBtn = document.getElementById('mok-delete-section');
        this.mokWriteConfigBtn = document.getElementById('mok-write-config');
        this.mokClearConfigBtn = document.getElementById('mok-clear-config');
        
        // Find the left scan block (first mok-scan-block)
        const scanBlocks = document.querySelectorAll('.mok-scan-block');
        this.mokScanBlock = scanBlocks.length > 0 ? scanBlocks[0] : null;
        
        // Initialize MOK scan state if not already done
        if (!this.mokScanResults) {
            this.mokScanResults = new Array(127).fill(false);
        }
        if (!this.mokDeviceInfo) {
            this.mokDeviceInfo = new Array(127).fill(null); // Store device type info for each address
        }
        if (this.mokScanInProgress === undefined) {
            this.mokScanInProgress = false;
        }
        if (this.mokCurrentViewStart === undefined) {
            this.mokCurrentViewStart = 0;
        }
        if (this.mokIndicatorsPerPage === undefined) {
            this.mokIndicatorsPerPage = 64;
        }
        
        // Pagination variables for address display
        if (this.mokVisibleAddresses === undefined) {
            this.mokVisibleAddresses = 40; // Start with 40 addresses
        }
        if (this.mokAddressesPerLoad === undefined) {
            this.mokAddressesPerLoad = 10; // Load 10 more addresses at a time
        }
        if (this.waitingForMokScanResponse === undefined) {
            this.waitingForMokScanResponse = false;
        }
        if (this.mokOutsideClickBound === undefined) {
            this.mokOutsideClickBound = false;
        }
        
        // Initialize section management state
        if (this.mokSelectedAddress === undefined) {
            this.mokSelectedAddress = null;
        }
        if (this.mokSelectedSection === undefined) {
            this.mokSelectedSection = null;
        }
        
        // Create address indicators if needed
        if (this.mokAddressIndicators && this.mokAddressIndicators.children.length === 0) {
            this.createMokAddressIndicators();
        }
        
        // Initialize arrow buttons state
        this.updateArrowButtonsState();
        
        // Load saved configuration
        this.loadMokConfigAuto();
        
        // Bind MOK-specific events
        this.bindMokEvents();
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
    
    hideOtherSectionsForMok() {
        // Hide parameters and results sections when MOK is active
        const parametersSection = document.querySelector('.parameters-section');
        const resultsSection = document.querySelector('.results-section');
        
        if (parametersSection) {
            parametersSection.style.display = 'none';
            parametersSection.setAttribute('data-hidden-for-mok', 'true');
        }
        
        if (resultsSection) {
            resultsSection.style.display = 'none';
            resultsSection.setAttribute('data-hidden-for-mok', 'true');
        }
    }
    
    showOtherSectionsAfterMok() {
        // Show parameters and results sections after leaving MOK
        const parametersSection = document.querySelector('.parameters-section');
        const resultsSection = document.querySelector('.results-section');
        
        if (parametersSection && parametersSection.getAttribute('data-hidden-for-mok') === 'true') {
            parametersSection.style.display = '';
            parametersSection.removeAttribute('data-hidden-for-mok');
        }
        
        if (resultsSection && resultsSection.getAttribute('data-hidden-for-mok') === 'true') {
            resultsSection.style.display = '';
            resultsSection.removeAttribute('data-hidden-for-mok');
        }
        
        // Remove MOK-specific styles
        const mokStyles = document.getElementById('mok-page-styles');
        if (mokStyles) {
            mokStyles.remove();
        }
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
        // Store previous tab for cleanup
        const previousTab = this.currentTab;
        
        // Remove active class from all tabs
        this.tabs.forEach(tab => tab.classList.remove('active'));

        // Add active class to selected tab
        const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
        if (selectedTab) {
            selectedTab.classList.add('active');
            
            // Load the tab content with previous tab info
            this.loadTabWithContext(tabName, previousTab);
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
        }
        // Check if we're waiting for MOK scan response
        else if (this.waitingForMokScanResponse) {
            try {
                // First try to parse as scan response (list of addresses)
                const scanResults = this.parseMokScanResponse(data);
                if (scanResults && scanResults.length > 0) {
                    // Update scan results for addresses found
                    scanResults.forEach(address => {
                        if (address >= 1 && address <= 127) {
                            this.mokScanResults[address - 1] = true;
                            // Set default device type until we get 24-byte response
                            if (!this.mokDeviceInfo[address - 1]) {
                                this.mokDeviceInfo[address - 1] = { type: 'АМ1', address: address };
                            }
                        }
                    });
                    
                    this.updateMokIndicatorsView();
                    this.updateMokAddressTree();
                    
                    // Auto-save configuration after scan results update
                    this.saveMokConfigAuto();
                    
                    const foundCount = scanResults.length;
                    this.logMessage(`МОК: Найдено ${foundCount} устройств: ${scanResults.join(', ')}`);
                    this.showToast('success', `МОК: Найдено ${foundCount} устройств`);
                }
                
                // Also try to parse as individual device response (24 bytes)
                const deviceInfo = this.parseIndividualDeviceResponse(data);
                if (deviceInfo) {
                    const address = deviceInfo.address;
                    if (address >= 1 && address <= 127) {
                        this.mokScanResults[address - 1] = true;
                        this.mokDeviceInfo[address - 1] = deviceInfo;
                        this.updateMokIndicatorsView();
                        this.updateMokAddressTree(); // Update tree to show new device name
                        
                        // Auto-save configuration when new device is found
                        this.saveMokConfigAuto();
                        
                        this.logMessage(`МОК: Устройство ${address}: ${deviceInfo.type}`);
                    }
                }
                
                // Only reset flags if this was a complete scan response (list of addresses)
                // For individual device responses, keep waiting for more responses
                if (scanResults && scanResults.length > 0) {
                    // This was a complete scan list response
                    this.waitingForMokScanResponse = false;
                    this.mokScanInProgress = false;
                    this.mokStartScanBtn.disabled = false;
                    this.mokStartScanBtn.innerHTML = '<i class="fas fa-search"></i> Начать сканирование';
                }
                // For individual responses, don't reset flags - wait for timeout
                
            } catch (error) {
                console.error('Error parsing MOK scan response:', error);
                this.logMessage(`МОК: Ошибка обработки ответа: ${error.message}`);
                this.waitingForMokScanResponse = false;
                this.mokScanInProgress = false;
                this.mokStartScanBtn.disabled = false;
                this.mokStartScanBtn.innerHTML = '<i class="fas fa-search"></i> Начать сканирование';
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

    bindMokEvents() {
        // Bind MOK-specific event listeners
        
        // Scan start button
        if (this.mokStartScanBtn && !this.mokStartScanBtn._eventBound) {
            this.mokStartScanBtn.addEventListener('click', () => this.startMokRs485Scan());
            this.mokStartScanBtn._eventBound = true;
        }

        // Arrow navigation buttons
        if (this.mokArrowLeftBtn && !this.mokArrowLeftBtn._eventBound) {
            this.mokArrowLeftBtn.addEventListener('click', () => this.mokScrollIndicators('left'));
            this.mokArrowLeftBtn._eventBound = true;
        }

        if (this.mokArrowRightBtn && !this.mokArrowRightBtn._eventBound) {
            this.mokArrowRightBtn.addEventListener('click', () => this.mokScrollIndicators('right'));
            this.mokArrowRightBtn._eventBound = true;
        }

        // Add addresses button
        if (this.mokAddAddressesBtn && !this.mokAddAddressesBtn._eventBound) {
            this.mokAddAddressesBtn.addEventListener('click', () => this.addMoreAddresses());
            this.mokAddAddressesBtn._eventBound = true;
        }

        // Clear assignments button
        if (this.mokClearAssignmentsBtn && !this.mokClearAssignmentsBtn._eventBound) {
            this.mokClearAssignmentsBtn.addEventListener('click', () => this.clearAllAssignments());
            this.mokClearAssignmentsBtn._eventBound = true;
        }

        // Config import/export buttons
        if (this.mokImportConfigBtn && !this.mokImportConfigBtn._eventBound) {
            this.mokImportConfigBtn.addEventListener('click', () => this.importMokConfig());
            this.mokImportConfigBtn._eventBound = true;
        }

        if (this.mokExportConfigBtn && !this.mokExportConfigBtn._eventBound) {
            this.mokExportConfigBtn.addEventListener('click', () => this.exportMokConfig());
            this.mokExportConfigBtn._eventBound = true;
        }

        // Section management buttons
        if (this.mokCreateSectionBtn && !this.mokCreateSectionBtn._eventBound) {
            this.mokCreateSectionBtn.addEventListener('click', () => this.createMokSection());
            this.mokCreateSectionBtn._eventBound = true;
        }

        if (this.mokDeleteSectionBtn && !this.mokDeleteSectionBtn._eventBound) {
            this.mokDeleteSectionBtn.addEventListener('click', () => this.deleteMokSection());
            this.mokDeleteSectionBtn._eventBound = true;
        }

        // Write config button
        if (this.mokWriteConfigBtn && !this.mokWriteConfigBtn._eventBound) {
            this.mokWriteConfigBtn.addEventListener('click', () => this.writeMokConfig());
            this.mokWriteConfigBtn._eventBound = true;
        }

        // Clear config button
        if (this.mokClearConfigBtn && !this.mokClearConfigBtn._eventBound) {
            this.mokClearConfigBtn.addEventListener('click', () => this.clearMokConfig());
            this.mokClearConfigBtn._eventBound = true;
        }

        // Click outside scan block to clear selection
        if (!this.mokOutsideClickBound) {
            document.addEventListener('click', (e) => this.handleMokOutsideClick(e));
            this.mokOutsideClickBound = true;
        }
    }

    getDeviceDisplayName(address) {
        // Get device display name - use device type if available, otherwise fallback to address
        if (this.mokDeviceInfo && this.mokDeviceInfo[address - 1] && this.mokDeviceInfo[address - 1].type) {
            return this.mokDeviceInfo[address - 1].type;
        }
        return `Устройство ${address}`;
    }

    showDeviceTypeSelectionDialog(address) {
        // Create modal dialog for device type selection
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        // Generate device type options
        const deviceTypes = this.generateDeviceTypeOptions();
        
        const modalContent = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3>Выбор типа устройства для адреса ${address}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="device-type-select">Тип устройства:</label>
                        <select id="device-type-select" class="form-input" style="width: 100%;">
                            <option value="">Выберите тип устройства</option>
                            ${deviceTypes.map(type => `<option value="${type}" ${this.getCurrentDeviceType(address) === type ? 'selected' : ''}>${type}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-top: 1rem;">
                        <button id="remove-device-type" class="btn btn-secondary" style="margin-right: 1rem;">
                            <i class="fas fa-times"></i> Убрать тип устройства
                        </button>
                        <small class="text-muted">Оставьте пустым, чтобы убрать назначенный тип</small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancel-device-type" class="btn btn-secondary">Отмена</button>
                    <button id="save-device-type" class="btn btn-primary">Сохранить</button>
                </div>
            </div>
        `;
        
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);

        // Focus on select
        const select = modal.querySelector('#device-type-select');
        select.focus();

        // Handle events
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('#cancel-device-type').addEventListener('click', closeModal);
        
        modal.querySelector('#remove-device-type').addEventListener('click', () => {
            select.value = '';
        });

        modal.querySelector('#save-device-type').addEventListener('click', () => {
            const selectedType = select.value.trim();
            this.assignDeviceType(address, selectedType);
            closeModal();
        });

        // Handle Enter key and Escape
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#save-device-type').click();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    generateDeviceTypeOptions() {
        const types = [
            'АМ1',
            // AM8 variants
            'АМ8/1', 'АМ8/2', 'АМ8/3', 'АМ8/4', 'АМ8/5', 'АМ8/6', 'АМ8/7', 'АМ8/8',
            // PM4 variants
            'РМ4/1', 'РМ4/2', 'РМ4/3', 'РМ4/4',
            // KL variants
            'КЛ1', 'КЛ2', 'КЛ3', 'КЛ4', 'КЛ5', 'КЛ6', 'КЛ7', 'КЛ8', 'КЛ9', 'КЛ10',
            'КЛ11', 'КЛ12', 'КЛ13', 'КЛ14', 'КЛ15', 'КЛ16', 'КЛ17', 'КЛ18', 'КЛ19', 'КЛ20',
            'КЛ21', 'КЛ22', 'КЛ23', 'КЛ24', 'КЛ25', 'КЛ26', 'КЛ27', 'КЛ28', 'КЛ29', 'КЛ30',
            'КЛ31', 'КЛ32', 'КЛ33', 'КЛ34', 'КЛ35', 'КЛ36', 'КЛ37', 'КЛ38', 'КЛ39', 'КЛ40',
            'КЛ41', 'КЛ42', 'КЛ43', 'КЛ44', 'КЛ45', 'КЛ46', 'КЛ47', 'КЛ48', 'КЛ49', 'КЛ50',
            // Sensor variants (СГ с шагом 0.5)
            'СГ0.5', 'СГ1', 'СГ1.5', 'СГ2', 'СГ2.5', 'СГ3', 'СГ3.5', 'СГ4', 'СГ4.5', 
            'СГ5', 'СГ5.5', 'СГ6',
            // Fire sensor
            'Пожарный датчик'
        ];
        return types;
    }

    getCurrentDeviceType(address) {
        if (this.mokDeviceInfo && this.mokDeviceInfo[address - 1] && this.mokDeviceInfo[address - 1].type) {
            return this.mokDeviceInfo[address - 1].type;
        }
        return '';
    }

    assignDeviceType(address, deviceType) {
        // Initialize device info array if needed
        if (!this.mokDeviceInfo) {
            this.mokDeviceInfo = new Array(127).fill(null);
        }

        if (deviceType.trim()) {
            // Assign device type
            this.mokDeviceInfo[address - 1] = {
                type: deviceType,
                address: address
            };
            
            // Mark as found device if not already
            if (!this.mokScanResults) {
                this.mokScanResults = new Array(127).fill(false);
            }
            this.mokScanResults[address - 1] = true;
            
            this.showToast('success', `Адресу ${address} назначен тип: ${deviceType}`);
        } else {
            // Remove device type
            this.mokDeviceInfo[address - 1] = null;
            this.mokScanResults[address - 1] = false;
            
            this.showToast('info', `Тип устройства снят с адреса ${address}`);
        }

        // Update UI
        this.updateMokIndicatorsView();
        this.updateMokAddressTree();
        
        // Auto-save configuration
        this.saveMokConfigAuto();
    }

    createMokAddressIndicators() {
        if (!this.mokAddressIndicators) return;
        
        // Clear existing indicators
        this.mokAddressIndicators.innerHTML = '';
        
        // Create indicators for visible addresses only
        for (let i = 1; i <= this.mokVisibleAddresses; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'mok-address-indicator inactive';
            indicator.textContent = i;
            indicator.setAttribute('data-address', i);
            indicator.setAttribute('title', `Адрес ${i}. Двойной клик для назначения типа устройства`);
            indicator.draggable = true;
            
            // Add click event
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectMokAddress(i);
            });
            
            // Double click events will be handled by delegation on the container
            
            // Add drag events
            indicator.addEventListener('dragstart', (e) => this.handleDragStart(e, i));
            indicator.addEventListener('dragend', (e) => this.handleDragEnd(e));
            
            this.mokAddressIndicators.appendChild(indicator);
        }
        
        // Add event delegation for double click on indicators
        this.mokAddressIndicators.addEventListener('dblclick', (e) => {
            const indicator = e.target.closest('.mok-address-indicator');
            if (indicator) {
                const address = parseInt(indicator.getAttribute('data-address'));
                this.showDeviceTypeSelectionDialog(address);
            }
        });
        
        // Update view
        this.updateMokIndicatorsView();
        
        // Update button state
        this.updateAddAddressesButton();
        
        // Setup drop zones for sections
        this.setupSectionDropZones();
    }

    addMoreAddresses() {
        // Calculate how many more addresses to add
        const maxAddresses = 127;
        const currentVisible = this.mokVisibleAddresses;
        const addressesToAdd = Math.min(this.mokAddressesPerLoad, maxAddresses - currentVisible);
        
        if (addressesToAdd <= 0) {
            this.showToast('info', 'Все адреса уже отображены');
            return;
        }
        
        // Update visible addresses count
        this.mokVisibleAddresses += addressesToAdd;
        
        // Create new indicators
        for (let i = currentVisible + 1; i <= this.mokVisibleAddresses; i++) {
            const indicator = document.createElement('div');
            indicator.className = 'mok-address-indicator inactive';
            indicator.textContent = i;
            indicator.setAttribute('data-address', i);
            indicator.setAttribute('title', `Адрес ${i}. Двойной клик для назначения типа устройства`);
            indicator.draggable = true;
            
            // Add click event
            indicator.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectMokAddress(i);
            });
            
            // Add drag events
            indicator.addEventListener('dragstart', (e) => this.handleDragStart(e, i));
            indicator.addEventListener('dragend', (e) => this.handleDragEnd(e));
            
            this.mokAddressIndicators.appendChild(indicator);
        }
        
        // Update view to show new indicators with proper status
        this.updateMokIndicatorsView();
        
        // Update button state
        this.updateAddAddressesButton();
        
        this.showToast('success', `Добавлено ${addressesToAdd} адресов. Всего отображается: ${this.mokVisibleAddresses}`);
    }

    updateAddAddressesButton() {
        if (!this.mokAddAddressesBtn) return;
        
        const maxAddresses = 127;
        const isMaxReached = this.mokVisibleAddresses >= maxAddresses;
        
        this.mokAddAddressesBtn.disabled = isMaxReached;
        
        if (isMaxReached) {
            this.mokAddAddressesBtn.innerHTML = '<i class="fas fa-check"></i> Все адреса загружены';
        } else {
            const remaining = maxAddresses - this.mokVisibleAddresses;
            const toAdd = Math.min(this.mokAddressesPerLoad, remaining);
            this.mokAddAddressesBtn.innerHTML = `<i class="fas fa-plus"></i> Добавить ${toAdd} адресов`;
        }
    }

    clearAllAssignments() {
        // Show confirmation dialog
        if (!confirm('Вы уверены, что хотите очистить все назначения типов устройств? Это действие нельзя отменить.')) {
            return;
        }
        
        // Clear all device assignments
        if (this.mokDeviceInfo) {
            this.mokDeviceInfo.fill(null);
        }
        
        // Clear scan results
        if (this.mokScanResults) {
            this.mokScanResults.fill(false);
        }
        
        // Update UI
        this.updateMokIndicatorsView();
        this.updateMokAddressTree();
        
        // Auto-save configuration
        this.saveMokConfigAuto();
        
        this.showToast('success', 'Все назначения типов устройств очищены');
    }

    updateMokIndicatorsView() {
        if (!this.mokAddressIndicators) return;
        
        const indicators = this.mokAddressIndicators.querySelectorAll('.mok-address-indicator');
        
        indicators.forEach((indicator, index) => {
            const address = parseInt(indicator.getAttribute('data-address'));
            const isSelected = indicator.classList.contains('selected');
            const isDragStatus = indicator.classList.contains('dragging');
            
            // Show all indicators (vertical scrolling handled by CSS)
            indicator.style.display = 'flex';
            
            // Remove status classes first
            indicator.classList.remove('active', 'inactive');
            
            // Update status based on scan results
            if (this.mokScanResults && this.mokScanResults[address - 1]) {
                indicator.classList.add('active');
                
                // Update display text with device type if available
                if (this.mokDeviceInfo && this.mokDeviceInfo[address - 1]) {
                    const deviceInfo = this.mokDeviceInfo[address - 1];
                    // Show as fraction: address on top, device type on bottom
                    indicator.innerHTML = `<div class="address-fraction">
                        <div class="address-top">${address}</div>
                        <div class="device-type-bottom">${deviceInfo.type}</div>
                    </div>`;
                    indicator.setAttribute('title', `Адрес ${address} - ${deviceInfo.type}. Двойной клик для изменения типа`);
                    
                    // Force DOM update
                    indicator.style.display = 'none';
                    indicator.offsetHeight; // Trigger reflow
                    indicator.style.display = 'flex';
                } else {
                    indicator.textContent = address; // Fallback to address number
                    indicator.setAttribute('title', `Адрес ${address}. Двойной клик для назначения типа устройства`);
                }
            } else {
                indicator.classList.add('inactive');
                indicator.textContent = address; // Show address number when inactive
                indicator.setAttribute('title', `Адрес ${address}. Двойной клик для назначения типа устройства`);
            }
            
            // Restore selection if it was selected or matches current selection
            if (isSelected || address === this.mokSelectedAddress) {
                indicator.classList.add('selected');
            }
            
            // Restore dragging state if needed
            if (isDragStatus) {
                indicator.classList.add('dragging');
            }
        });
        
        // Update arrow buttons state based on selections
        this.updateArrowButtonsState();
    }

    mokScrollIndicators(direction) {
        // Check if both address and section are selected
        if (!this.mokSelectedAddress) {
            this.showToast('warning', 'Выберите адрес в левом блоке');
            return;
        }
        
        if (!this.mokSelectedSection) {
            this.showToast('warning', 'Выберите раздел в правом блоке');
            return;
        }
        
        const section = this.mokSections.find(s => s.id === this.mokSelectedSection);
        if (!section) {
            this.showToast('error', 'Выбранный раздел не найден');
            return;
        }
        
        if (direction === 'left') {
            // Remove address from section
            this.moveAddressToSection(this.mokSelectedAddress, null);
        } else if (direction === 'right') {
            // Add address to section
            this.moveAddressToSection(this.mokSelectedAddress, this.mokSelectedSection);
            
            // Clear selection after moving to section
            this.clearMokAddressSelection();
        }
    }

    selectMokAddress(address) {
        // Remove previous selection
        const indicators = this.mokAddressIndicators.querySelectorAll('.mok-address-indicator');
        indicators.forEach(indicator => indicator.classList.remove('selected'));
        
        // Add selection to clicked indicator
        const selectedIndicator = this.mokAddressIndicators.querySelector(`[data-address="${address}"]`);
        if (selectedIndicator) {
            selectedIndicator.classList.add('selected');
            this.mokSelectedAddress = address; // Save selected address
            this.updateMokAddressTree(address);
            this.scrollToMokAddress(address);
            this.updateArrowButtonsState(); // Update arrow buttons state
        }
    }

    clearMokAddressSelection() {
        // Remove selection from all indicators
        const indicators = this.mokAddressIndicators.querySelectorAll('.mok-address-indicator');
        indicators.forEach(indicator => indicator.classList.remove('selected'));
        
        // Clear selected address
        this.mokSelectedAddress = null;
        
        // Update arrow buttons state
        this.updateArrowButtonsState();
    }

    handleMokOutsideClick(e) {
        // Only handle if we're on MOK tab and have a scan block
        if (this.currentTab !== 'mok' || !this.mokScanBlock || !this.mokSelectedAddress) {
            return;
        }

        // Check if the click is outside the scan block
        if (!this.mokScanBlock.contains(e.target)) {
            this.clearMokAddressSelection();
        }
    }

    updateMokAddressTree(selectedAddress = null) {
        if (!this.mokAddressTree || !this.mokFoundCount) return;
        
        // Initialize sections if not exists
        if (!this.mokSections) {
            this.mokSections = [];
        }
        
        const foundAddresses = [];
        if (this.mokScanResults) {
            this.mokScanResults.forEach((isResponding, index) => {
                if (isResponding) {
                    foundAddresses.push(index + 1);
                }
            });
        }
        
        this.mokFoundCount.textContent = foundAddresses.length.toString();
        
        // Create tree structure with sections and found devices
        let treeHTML = '';
        
        // Add sections if any exist
        if (this.mokSections.length > 0) {
            treeHTML += '<div class="mok-tree-header">Разделы системы:</div>';
            this.mokSections.forEach(section => {
                const isSectionSelected = this.mokSelectedSection === section.id ? 'selected' : '';
                const deviceCount = section.addresses.length;
                const activeDevices = section.addresses.filter(addr => {
                    const addressNum = typeof addr === 'number' ? addr : addr.address;
                    return this.mokScanResults && this.mokScanResults[addressNum - 1];
                }).length;
                
                treeHTML += `
                    <div class="mok-tree-node section ${isSectionSelected}" data-section-id="${section.id}">
                        <div class="section-header">
                            <div class="section-info">
                                <i class="fas fa-folder"></i>
                                <span class="section-name" data-section-id="${section.id}">${section.name}</span>
                                <button class="btn-edit-section" data-section-id="${section.id}" title="Редактировать название">
                                    <i class="fas fa-edit"></i>
                                </button>
                            </div>
                            <div class="section-status">
                                <span class="section-address-count">${deviceCount} устройств</span>
                                <div class="device-status-indicator">
                                    <div class="status-dot active" title="Активные: ${activeDevices}"></div>
                                    <div class="status-dot inactive" title="Неактивные: ${deviceCount - activeDevices}"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                // Add addresses within the section if any
                if (section.addresses && section.addresses.length > 0) {
                    section.addresses.forEach(addressObj => {
                        // Handle both old format (number) and new format (object)
                        const address = typeof addressObj === 'number' ? addressObj : addressObj.address;
                        const deviceType = typeof addressObj === 'object' && addressObj.type ? addressObj.type : 'Охранный';
                        
                        const isAddressSelected = selectedAddress === address ? 'selected' : '';
                        const isDeviceResponding = this.mokScanResults && this.mokScanResults[address - 1];
                        const deviceStatus = isDeviceResponding ? 'active' : 'inactive';
                        const statusIcon = isDeviceResponding ? 'fa-microchip' : 'fa-microchip';
                        
                        // Get device display name (type if available)
                        const deviceDisplayName = this.getDeviceDisplayName(address);
                        
                        treeHTML += `
                            <div class="mok-tree-node device section-device ${isAddressSelected} ${deviceStatus}" data-address="${address}" style="margin-left: 20px;">
                                <div class="device-info">
                                    <div class="device-left">
                                        <i class="fas ${statusIcon}"></i>
                                        <span class="device-name">${deviceDisplayName}</span>
                                    </div>
                                    <div class="device-right">
                                        <select class="device-type-select" data-address="${address}" data-section-id="${section.id}">
                                            <option value="Охранный" ${deviceType === 'Охранный' ? 'selected' : ''}>Охранный</option>
                                            <option value="Пожарный" ${deviceType === 'Пожарный' ? 'selected' : ''}>Пожарный</option>
                                            <option value="Технологический" ${deviceType === 'Технологический' ? 'selected' : ''}>Технологический</option>
                                        </select>
                                        <div class="device-status">
                                            <span class="status-text ${deviceStatus}">${isDeviceResponding ? 'Активно' : 'Не отвечает'}</span>
                                            <div class="status-dot ${deviceStatus}"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                }
            });
            treeHTML += '<div class="mok-tree-separator"></div>';
        }
        
        // Add found devices that are not in any section
        const addressesInSections = new Set();
        this.mokSections.forEach(section => {
            section.addresses.forEach(addr => {
                const addressNum = typeof addr === 'number' ? addr : addr.address;
                addressesInSections.add(addressNum);
            });
        });
        
        const unassignedAddresses = foundAddresses.filter(addr => !addressesInSections.has(addr));
        
        if (unassignedAddresses.length > 0) {
            treeHTML += '<div class="mok-tree-header">Свободные устройства:</div>';
            unassignedAddresses.forEach(address => {
                const isSelected = selectedAddress === address ? 'selected' : '';
                const isDeviceResponding = this.mokScanResults && this.mokScanResults[address - 1];
                const deviceStatus = isDeviceResponding ? 'active' : 'inactive';
                const statusIcon = isDeviceResponding ? 'fa-microchip' : 'fa-microchip';
                
                // Get device display name (type if available)
                const deviceDisplayName = this.getDeviceDisplayName(address);
                
                treeHTML += `
                    <div class="mok-tree-node device ${isSelected} ${deviceStatus}" data-address="${address}">
                        <div class="device-info">
                            <div class="device-left">
                                <i class="fas ${statusIcon}"></i>
                                <span class="device-name">${deviceDisplayName}</span>
                            </div>
                            <div class="device-status">
                                <span class="status-text ${deviceStatus}">${isDeviceResponding ? 'Активно' : 'Не отвечает'}</span>
                                <div class="status-dot ${deviceStatus}"></div>
                            </div>
                        </div>
                    </div>
                `;
            });
        } else if (foundAddresses.length === 0 && this.mokSections.length === 0) {
            treeHTML = '<div class="tree-placeholder">Сканируйте шину для отображения дерева системы</div>';
        } else if (foundAddresses.length === 0) {
            treeHTML += '<div class="tree-placeholder">Устройства не найдены. Выполните сканирование.</div>';
        } else {
            treeHTML += '<div class="tree-placeholder">Все найденные устройства распределены по разделам</div>';
        }
        
        this.mokAddressTree.innerHTML = treeHTML;
        
        // Add click handlers to tree nodes
        const treeNodes = this.mokAddressTree.querySelectorAll('.mok-tree-node');
        treeNodes.forEach(node => {
            node.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Check if edit button was clicked
                const editBtn = e.target.closest('.btn-edit-section');
                if (editBtn) {
                    e.stopPropagation();
                    const sectionId = parseInt(editBtn.getAttribute('data-section-id'));
                    this.editMokSectionName(sectionId);
                    return;
                }
                
                // Check if device type selector was clicked
                const deviceTypeSelect = e.target.closest('.device-type-select');
                if (deviceTypeSelect) {
                    return; // Don't handle node selection when clicking on select
                }
                
                // Remove previous selection
                treeNodes.forEach(n => n.classList.remove('selected'));
                
                // Add selection to clicked node
                node.classList.add('selected');
                
                const address = node.getAttribute('data-address');
                const sectionId = node.getAttribute('data-section-id');
                
                if (address) {
                    // Device node clicked
                    this.selectMokAddress(parseInt(address));
                } else if (sectionId) {
                    // Section node clicked
                    this.selectMokSection(parseInt(sectionId));
                }
            });
        });

        // Add click handlers to edit buttons specifically
        const editButtons = this.mokAddressTree.querySelectorAll('.btn-edit-section');
        editButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sectionId = parseInt(btn.getAttribute('data-section-id'));
                this.editMokSectionName(sectionId);
            });
        });

        // Add change handlers to device type selectors
        const deviceTypeSelectors = this.mokAddressTree.querySelectorAll('.device-type-select');
        deviceTypeSelectors.forEach(selector => {
            selector.addEventListener('change', (e) => {
                e.stopPropagation();
                const address = parseInt(e.target.getAttribute('data-address'));
                const sectionId = parseInt(e.target.getAttribute('data-section-id'));
                const newType = e.target.value;
                this.updateDeviceType(address, sectionId, newType);
            });
        });

        // Setup drop zones for sections
        this.setupSectionDropZones();
    }

    scrollToMokAddress(address) {
        const indicator = this.mokAddressIndicators.querySelector(`[data-address="${address}"]`);
        if (indicator) {
            const targetStart = Math.floor((address - 1) / this.mokIndicatorsPerPage) * this.mokIndicatorsPerPage;
            this.mokCurrentViewStart = targetStart;
            this.updateMokIndicatorsView();
        }
    }

    selectMokSection(sectionId) {
        // Handle section selection
        const section = this.mokSections.find(s => s.id === sectionId);
        if (section) {
            this.mokSelectedSection = sectionId; // Save selected section
            this.showToast('info', `Выбран раздел: ${section.name}`);
            this.updateArrowButtonsState(); // Update arrow buttons state
        }
    }

    moveAddressToSection(address, sectionId) {
        // Remove address from all sections first
        this.mokSections.forEach(section => {
            // Handle both old format (numbers) and new format (objects)
            section.addresses = section.addresses.filter(addr => {
                if (typeof addr === 'number') {
                    return addr !== address;
                } else if (typeof addr === 'object' && addr.address) {
                    return addr.address !== address;
                }
                return true;
            });
        });
        
        // Add address to the specified section
        if (sectionId !== null) {
            const section = this.mokSections.find(s => s.id === sectionId);
            if (section) {
                // Check if address already exists in this section
                const addressExists = section.addresses.some(addr => {
                    if (typeof addr === 'number') {
                        return addr === address;
                    } else if (typeof addr === 'object' && addr.address) {
                        return addr.address === address;
                    }
                    return false;
                });
                
                if (!addressExists) {
                    // Get device type from scan results if available
                    let deviceType = 'Охранный'; // Default type
                    if (this.mokDeviceInfo && this.mokDeviceInfo[address - 1] && this.mokDeviceInfo[address - 1].type) {
                        deviceType = this.mokDeviceInfo[address - 1].type;
                    }
                    
                    // Add new address object with device type from scan or default
                    section.addresses.push({
                        address: address,
                        type: deviceType
                    });
                    // Sort by address number
                    section.addresses.sort((a, b) => {
                        const addrA = typeof a === 'number' ? a : a.address;
                        const addrB = typeof b === 'number' ? b : b.address;
                        return addrA - addrB;
                    });
                    const deviceDisplayName = this.getDeviceDisplayName(address);
                    this.showToast('success', `${deviceDisplayName} добавлен в ${section.name}`);
                }
            }
        } else {
            const deviceDisplayName = this.getDeviceDisplayName(address);
            this.showToast('info', `${deviceDisplayName} удален из всех разделов`);
        }
        
        // Update the tree display
        this.updateMokAddressTree(this.mokSelectedAddress);
        
        // Auto-save configuration
        this.saveMokConfigAuto();
    }

    updateDeviceType(address, sectionId, newType) {
        const section = this.mokSections.find(s => s.id === sectionId);
        if (!section) {
            this.showToast('error', 'Раздел не найден');
            return;
        }

        // Find the address object in the section
        const addressIndex = section.addresses.findIndex(addr => {
            if (typeof addr === 'number') {
                return addr === address;
            } else if (typeof addr === 'object' && addr.address) {
                return addr.address === address;
            }
            return false;
        });

        if (addressIndex !== -1) {
            // Update the type
            if (typeof section.addresses[addressIndex] === 'object' && section.addresses[addressIndex].address) {
                section.addresses[addressIndex].type = newType;
            } else {
                // Convert from old format to new format
                section.addresses[addressIndex] = {
                    address: section.addresses[addressIndex],
                    type: newType
                };
            }
            
            // Auto-save configuration
            this.saveMokConfigAuto();
            
            const deviceDisplayName = this.getDeviceDisplayName(address);
            this.showToast('success', `Тип ${deviceDisplayName} изменен на ${newType}`);
        } else {
            this.showToast('error', 'Адрес не найден в разделе');
        }
    }

    updateArrowButtonsState() {
        // Enable arrow buttons only if both address and section are selected
        const bothSelected = this.mokSelectedAddress !== null && this.mokSelectedSection !== null;
        
        if (this.mokArrowLeftBtn) {
            this.mokArrowLeftBtn.disabled = !bothSelected;
        }
        if (this.mokArrowRightBtn) {
            this.mokArrowRightBtn.disabled = !bothSelected;
        }
    }

    async saveMokConfigAuto() {
        try {
            // Prepare configuration data
            const configData = {
                sections: this.mokSections || [],
                scanResults: this.mokScanResults || [],
                deviceInfo: this.mokDeviceInfo || [],
                timestamp: new Date().toISOString()
            };

            // Save via IPC
            const result = await ipcRenderer.invoke('save-mok-config', configData);
            
            if (result.success) {
                console.log('MOK config auto-saved');
            } else {
                console.error('Failed to auto-save MOK config:', result.message);
            }
        } catch (error) {
            console.error('Error in auto-save MOK config:', error);
        }
    }

    async loadMokConfigAuto() {
        try {
            const result = await ipcRenderer.invoke('load-mok-config');
            
            if (result.success && result.data) {
                // Restore sections
                if (result.data.sections && Array.isArray(result.data.sections)) {
                    this.mokSections = result.data.sections;
                }
                
                // Restore scan results
                if (result.data.scanResults && Array.isArray(result.data.scanResults)) {
                    this.mokScanResults = new Array(127).fill(false);
                    result.data.scanResults.forEach((isFound, index) => {
                        if (index < 127) {
                            this.mokScanResults[index] = isFound;
                        }
                    });
                }
                
                // Restore device info
                if (result.data.deviceInfo && Array.isArray(result.data.deviceInfo)) {
                    this.mokDeviceInfo = new Array(127).fill(null);
                    result.data.deviceInfo.forEach((deviceInfo, index) => {
                        if (index < 127 && deviceInfo) {
                            this.mokDeviceInfo[index] = deviceInfo;
                        }
                    });
                }
                
                // Update UI only if we're on MOK tab
                if (this.currentTab === 'mok') {
                    this.updateMokIndicatorsView();
                    this.updateMokAddressTree();
                }
                
                console.log('MOK config auto-loaded');
            }
        } catch (error) {
            console.error('Error in auto-load MOK config:', error);
        }
    }

    async clearMokConfig() {
        try {
            // Show confirmation dialog
            const confirmed = confirm('Вы уверены, что хотите удалить все разделы и очистить дерево системы?\n\nЭто действие нельзя отменить.');
            
            if (!confirmed) {
                return;
            }

            // Show loading state
            if (this.mokClearConfigBtn) {
                this.mokClearConfigBtn.disabled = true;
                this.mokClearConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Очистка...';
            }

            // Clear all data
            this.mokSections = [];
            this.mokScanResults = new Array(127).fill(false);
            this.mokDeviceInfo = new Array(127).fill(null);
            this.mokSelectedAddress = null;
            this.mokSelectedSection = null;

            // Clear internal config file
            const result = await ipcRenderer.invoke('clear-mok-config');
            
            if (result.success) {
                // Update UI
                this.updateMokIndicatorsView();
                this.updateMokAddressTree();
                this.updateArrowButtonsState();
                
                this.logMessage('Конфигурация МОК полностью очищена');
                this.showToast('success', 'Дерево системы очищено');
            } else {
                this.showToast('error', 'Ошибка очистки конфигурации: ' + result.message);
            }

        } catch (error) {
            console.error('Error clearing MOK config:', error);
            this.logMessage(`Ошибка очистки конфигурации МОК: ${error.message}`);
            this.showToast('error', 'Ошибка очистки конфигурации');
        } finally {
            // Restore button state
            if (this.mokClearConfigBtn) {
                this.mokClearConfigBtn.disabled = false;
                this.mokClearConfigBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Удалить дерево';
            }
        }
    }

    async writeMokConfig() {
        if (!this.comPortSelect.value) {
            this.showToast('error', 'Сначала подключитесь к COM порту');
            return;
        }

        // Check if there are any sections to write
        if (!this.mokSections || this.mokSections.length === 0) {
            this.showToast('warning', 'Нет разделов для записи в конфигурацию');
            return;
        }

        try {
            // Show loading state
            if (this.mokWriteConfigBtn) {
                this.mokWriteConfigBtn.disabled = true;
                this.mokWriteConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Запись...';
            }

            // Log the operation
            this.logMessage('Начало записи конфигурации МОК в устройство');

            // Create configuration data from sections
            const configData = {
                sections: this.mokSections.map(section => ({
                    id: section.id,
                    name: section.name,
                    addresses: section.addresses
                })),
                timestamp: new Date().toISOString()
            };

            this.logMessage(`Конфигурация содержит ${configData.sections.length} разделов`);

            // Here would be the actual command to send configuration to МОК device
            // For now, we'll simulate the process
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Simulate successful write
            this.logMessage('Конфигурация МОК успешно записана в устройство');
            this.showToast('success', 'Конфигурация МОК успешно записана');

        } catch (error) {
            console.error('Error writing MOK config:', error);
            this.logMessage(`Ошибка записи конфигурации МОК: ${error.message}`);
            this.showToast('error', 'Ошибка записи конфигурации');
        } finally {
            // Restore button state
            if (this.mokWriteConfigBtn) {
                this.mokWriteConfigBtn.disabled = false;
                this.mokWriteConfigBtn.innerHTML = '<i class="fas fa-save"></i> Сохранить дерево';
            }
        }
    }

    async importMokConfig() {
        try {
            // Show loading state
            if (this.mokImportConfigBtn) {
                this.mokImportConfigBtn.disabled = true;
                this.mokImportConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Импорт...';
            }

            // Create file input element
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json,.txt';
            fileInput.style.display = 'none';

            // Handle file selection
            const filePromise = new Promise((resolve, reject) => {
                fileInput.onchange = (event) => {
                    const file = event.target.files[0];
                    if (!file) {
                        reject(new Error('Файл не выбран'));
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        try {
                            const configData = JSON.parse(e.target.result);
                            resolve(configData);
                        } catch (error) {
                            reject(new Error('Ошибка чтения файла конфигурации'));
                        }
                    };
                    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
                    reader.readAsText(file);
                };

                fileInput.oncancel = () => {
                    reject(new Error('Импорт отменен'));
                };
            });

            document.body.appendChild(fileInput);
            fileInput.click();

            const configData = await filePromise;
            document.body.removeChild(fileInput);

            // Enhanced validation of imported data
            if (!configData.sections || !Array.isArray(configData.sections)) {
                throw new Error('Неверный формат файла конфигурации: отсутствует массив sections');
            }

            if (configData.sections.length > 50) {
                throw new Error('Слишком много разделов. Максимум 50 разделов');
            }

            // Validate each section before import
            const validSections = [];
            for (const section of configData.sections) {
                if (!section || typeof section !== 'object') {
                    console.warn('Пропущен недопустимый раздел');
                    continue;
                }

                // Validate section name
                if (!section.name || typeof section.name !== 'string' || section.name.trim().length === 0) {
                    section.name = `Импортированный раздел ${validSections.length + 1}`;
                }
                if (section.name.length > 50) {
                    section.name = section.name.substring(0, 50);
                }

                // Validate addresses array
                if (!Array.isArray(section.addresses)) {
                    section.addresses = [];
                }

                // Validate and normalize addresses (handle both old and new formats)
                const validAddresses = [];
                const seenAddresses = new Set();
                
                section.addresses.forEach(addr => {
                    let addressNum, deviceType = 'Охранный';
                    
                    if (typeof addr === 'number') {
                        addressNum = addr;
                    } else if (typeof addr === 'object' && addr.address) {
                        addressNum = addr.address;
                        deviceType = addr.type || 'Охранный';
                    } else {
                        addressNum = parseInt(addr);
                    }
                    
                    if (!isNaN(addressNum) && addressNum >= 1 && addressNum <= 127 && !seenAddresses.has(addressNum)) {
                        validAddresses.push({
                            address: addressNum,
                            type: deviceType
                        });
                        seenAddresses.add(addressNum);
                    }
                });

                // Sort addresses by address number
                section.addresses = validAddresses.sort((a, b) => a.address - b.address);

                // Check for duplicate section names
                const isDuplicateName = validSections.some(s => s.name === section.name);
                if (isDuplicateName) {
                    section.name += ` (${validSections.length + 1})`;
                }

                validSections.push({
                    id: section.id && typeof section.id === 'number' ? section.id : null,
                    name: section.name.trim(),
                    addresses: section.addresses,
                    createdAt: section.createdAt || new Date().toISOString()
                });
            }

            // Generate IDs for sections without them
            let nextId = 1;
            if (this.mokSections && this.mokSections.length > 0) {
                nextId = Math.max(...this.mokSections.map(s => s.id || 0)) + 1;
            }

            // Import sections with proper ID generation
            this.mokSections = validSections.map(section => ({
                id: section.id || nextId++,
                name: section.name,
                addresses: section.addresses,
                createdAt: section.createdAt
            }));

            // Update the display
            this.updateMokAddressTree();
            
            // Auto-save imported configuration
            this.saveMokConfigAuto();
            
            this.logMessage(`Импортировано ${this.mokSections.length} разделов из конфигурации`);
            this.showToast('success', `Успешно импортировано ${this.mokSections.length} разделов`);

        } catch (error) {
            console.error('Error importing MOK config:', error);
            this.logMessage(`Ошибка импорта конфигурации МОК: ${error.message}`);
            this.showToast('error', error.message.includes('отменен') ? error.message : 'Ошибка импорта конфигурации');
        } finally {
            // Restore button state
            if (this.mokImportConfigBtn) {
                this.mokImportConfigBtn.disabled = false;
                this.mokImportConfigBtn.innerHTML = '<i class="fas fa-upload"></i> Импорт конфиг МОК';
            }
        }
    }

    async exportMokConfig() {
        try {
            // Check if there are sections to export
            if (!this.mokSections || this.mokSections.length === 0) {
                this.showToast('warning', 'Нет разделов для экспорта');
                return;
            }

            // Show loading state
            if (this.mokExportConfigBtn) {
                this.mokExportConfigBtn.disabled = true;
                this.mokExportConfigBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Экспорт...';
            }

            // Create configuration data
            const configData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                sections: this.mokSections.map(section => ({
                    id: section.id,
                    name: section.name,
                    addresses: section.addresses,
                    createdAt: section.createdAt
                }))
            };

            // Create and download file
            const jsonString = JSON.stringify(configData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `mok-config-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            URL.revokeObjectURL(url);

            this.logMessage(`Экспортировано ${configData.sections.length} разделов в файл конфигурации`);
            this.showToast('success', `Конфигурация экспортирована (${configData.sections.length} разделов)`);

        } catch (error) {
            console.error('Error exporting MOK config:', error);
            this.logMessage(`Ошибка экспорта конфигурации МОК: ${error.message}`);
            this.showToast('error', 'Ошибка экспорта конфигурации');
        } finally {
            // Restore button state
            if (this.mokExportConfigBtn) {
                this.mokExportConfigBtn.disabled = false;
                this.mokExportConfigBtn.innerHTML = '<i class="fas fa-file-export"></i> Экспорт конфиг МОК';
            }
        }
    }

    async startMokRs485Scan() {
        if (!this.comPortSelect.value) {
            this.showToast('error', 'Сначала подключитесь к COM порту');
            return;
        }
        
        if (this.mokScanInProgress) {
            this.showToast('warning', 'Сканирование уже выполняется');
            return;
        }
        
        this.mokScanInProgress = true;
        this.mokStartScanBtn.disabled = true;
        this.mokStartScanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Сканирование...';
        
        // Reset scan results and device info
        this.mokScanResults = new Array(127).fill(false);
        this.mokDeviceInfo = new Array(127).fill(null);
        this.updateMokIndicatorsView();
        this.updateMokAddressTree();
        
        try {
            // Create and send scan command
            const scanCommand = this.createMokScanCommand();
            this.logMessage(`TX: ${scanCommand} | Начало сканирования RS485 для МОК`);
            
            // Set flag to wait for scan response
            this.waitingForMokScanResponse = true;
            
            // Send command via IPC
            const result = await ipcRenderer.invoke('send-command', scanCommand);
            
            if (result.success) {
                this.showToast('info', 'Команда сканирования отправлена');
                
                // Set timeout for scan operation (30 seconds for 127 addresses)
                setTimeout(() => {
                    if (this.waitingForMokScanResponse) {
                        this.waitingForMokScanResponse = false;
                        this.mokScanInProgress = false;
                        this.mokStartScanBtn.disabled = false;
                        this.mokStartScanBtn.innerHTML = '<i class="fas fa-search"></i> Начать сканирование';
                        this.showToast('warning', 'Таймаут сканирования. Возможно, некоторые устройства не отвечают.');
                        this.logMessage('МОК: Таймаут сканирования');
                    }
                }, 30000);
            } else {
                this.showToast('error', 'Ошибка отправки команды сканирования');
                this.waitingForMokScanResponse = false;
                this.mokScanInProgress = false;
                this.mokStartScanBtn.disabled = false;
                this.mokStartScanBtn.innerHTML = '<i class="fas fa-search"></i> Начать сканирование';
            }
        } catch (error) {
            console.error('Error during MOK scan:', error);
            this.showToast('error', 'Ошибка сканирования: ' + error.message);
            this.waitingForMokScanResponse = false;
            this.mokScanInProgress = false;
            this.mokStartScanBtn.disabled = false;
            this.mokStartScanBtn.innerHTML = '<i class="fas fa-search"></i> Начать сканирование';
        }
    }

    createMokScanCommand() {
        // Create 5-byte RS485 scan command for MOK
        const commandByte = 0x65; // Scan command
        const startAddress = 0x01; // Start from address 1
        const endAddress = 0x7F; // End at address 127
        const checksum = commandByte ^ startAddress ^ endAddress;
        
        const commandBytes = [
            commandByte, 
            startAddress, 
            endAddress, 
            checksum & 0xFF, 
            (checksum >> 8) & 0xFF
        ];
        
        return commandBytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    parseMokScanResponse(data) {
        try {
            // Parse MOK scan response format
            // Expected format: МОК_SCAN:addresses (e.g., "МОК_SCAN:1,2,5,10,15")
            if (data.startsWith('МОК_SCAN:')) {
                const addressesStr = data.substring(9); // Remove "МОК_SCAN:" prefix
                const addresses = addressesStr.split(',')
                    .map(addr => parseInt(addr.trim()))
                    .filter(addr => !isNaN(addr) && addr >= 1 && addr <= 127);
                return addresses;
            }
            
            // Alternative format: SCAN_MOK:addresses
            if (data.startsWith('SCAN_MOK:')) {
                const addressesStr = data.substring(9);
                const addresses = addressesStr.split(',')
                    .map(addr => parseInt(addr.trim()))
                    .filter(addr => !isNaN(addr) && addr >= 1 && addr <= 127);
                return addresses;
            }
            
            // Fallback: try to parse as simple comma-separated addresses
            if (data.includes(',')) {
                const addresses = data.split(',')
                    .map(addr => parseInt(addr.trim()))
                    .filter(addr => !isNaN(addr) && addr >= 1 && addr <= 127);
                if (addresses.length > 0) {
                    return addresses;
                }
            }
            
            // Single address format
            const singleAddr = parseInt(data.trim());
            if (!isNaN(singleAddr) && singleAddr >= 1 && singleAddr <= 127) {
                return [singleAddr];
            }
            
            return [];
        } catch (error) {
            console.error('Error parsing MOK scan response:', error);
            return [];
        }
    }

    parseDeviceInfoFrom24Bytes(responseData, address) {
        try {
            // Parse 24-byte response to determine device type
            // This function should parse the actual device response format
            
            // For now, we'll implement the logic based on device types described:
            // АМ1 - single address
            // АМ8 - 8 addresses on board (АМ8/1-АМ8/8)  
            // РМ4 - 4 addresses on board (РМ4/1-РМ4/4)
            // КЛ - keyboard
            
            // This is a placeholder implementation - should be adjusted based on actual 24-byte response format
            let deviceType = 'АМ1'; // Default
            let deviceNumber = null;
            
            // Try to determine device type from response data
            // Assuming the response contains device type information in specific bytes
            // This logic should be updated based on actual device protocol
            
            // For now, we'll use a simple mapping based on address ranges for testing
            // In real implementation, this should parse the actual 24-byte response
            
            // Try to parse response data (could be hex string, byte array, or text)
            let responseBytes = null;
            
            if (typeof responseData === 'string') {
                // Try to parse as hex string first
                if (responseData.length === 48 && /^[0-9a-fA-F]+$/.test(responseData)) {
                    // 24 bytes as hex string
                    responseBytes = [];
                    for (let i = 0; i < responseData.length; i += 2) {
                        responseBytes.push(parseInt(responseData.substr(i, 2), 16));
                    }
                } else {
                    // Try to parse as text representation
                    responseBytes = new TextEncoder().encode(responseData).slice(0, 24);
                }
            } else if (Array.isArray(responseData)) {
                responseBytes = responseData.slice(0, 24);
            }
            
            if (responseBytes && responseBytes.length >= 4) {
                // Parse device type from response bytes (adjust based on actual protocol)
                // Assuming first 4 bytes contain device type identifier
                const deviceTypeBytes = responseBytes.slice(0, 4);
                const typeString = new TextDecoder().decode(deviceTypeBytes).replace(/\0/g, '').trim();
                
                if (typeString.includes('AM8') || typeString.includes('АМ8')) {
                    // Extract channel number from byte 4 or 5
                    const channelByte = responseBytes[4] || responseBytes[5] || 1;
                    deviceNumber = Math.min(8, Math.max(1, channelByte));
                    deviceType = `АМ8/${deviceNumber}`;
                } else if (typeString.includes('PM4') || typeString.includes('РМ4')) {
                    // Extract channel number for PM4 (1-4)
                    const channelByte = responseBytes[4] || responseBytes[5] || 1;
                    deviceNumber = Math.min(4, Math.max(1, channelByte));
                    deviceType = `РМ4/${deviceNumber}`;
                } else if (typeString.includes('KL') || typeString.includes('КЛ')) {
                    deviceType = 'КЛ';
                } else {
                    deviceType = 'АМ1';
                }
            } else {
                // Fallback logic based on address ranges for testing
                // This should be removed when real 24-byte parsing is implemented
                if (address >= 1 && address <= 8) {
                    deviceType = `АМ8/${address}`;
                } else if (address >= 9 && address <= 12) {
                    deviceType = `РМ4/${address - 8}`;
                } else if (address >= 13 && address <= 15) {
                    deviceType = 'КЛ';
                }
            }
            
            return {
                type: deviceType,
                address: address
            };
        } catch (error) {
            console.error('Error parsing device info:', error);
            return {
                type: 'АМ1',
                address: address
            };
        }
    }

    parseIndividualDeviceResponse(data) {
        try {
            // Try to parse individual device response format
            // This could be in format: ADDRESS:24BYTE_RESPONSE_DATA or similar
            
            // Check if data looks like a 24-byte response with address prefix
            if (data.includes(':')) {
                const parts = data.split(':');
                if (parts.length >= 2) {
                    const address = parseInt(parts[0]);
                    const responseData = parts[1];
                    
                    if (!isNaN(address) && address >= 1 && address <= 127) {
                        // Try to parse the 24-byte response data
                        return this.parseDeviceInfoFrom24Bytes(responseData, address);
                    }
                }
            }
            
            // Try to parse as hex data (24 bytes = 48 hex characters)
            if (data.length === 48 && /^[0-9a-fA-F]+$/.test(data)) {
                // This looks like 24-byte hex data, but we need to know the address
                // For now, return null as we can't determine address from hex data alone
                return null;
            }
            
            // Try to extract address and device type from response string
            // Assuming format might be something like: "ADDR:DEVICE_TYPE" or similar
            const addressMatch = data.match(/(\d+)/);
            if (addressMatch) {
                const address = parseInt(addressMatch[1]);
                if (address >= 1 && address <= 127) {
                    return this.parseDeviceInfoFrom24Bytes(data, address);
                }
            }
            
            return null;
        } catch (error) {
            console.error('Error parsing individual device response:', error);
            return null;
        }
    }

    simulateMokScanResults() {
        // Simulate responses from some addresses (for testing)
        const respondingAddresses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100, 110, 120];
        
        respondingAddresses.forEach(address => {
            if (address <= 127) {
                this.mokScanResults[address - 1] = true;
                
                // Add simulated device type information
                let deviceType = 'АМ1';
                if (address >= 1 && address <= 8) {
                    deviceType = `АМ8/${address}`;
                } else if (address >= 9 && address <= 12) {
                    deviceType = `РМ4/${address - 8}`;
                } else if (address >= 13 && address <= 15) {
                    deviceType = 'КЛ';
                }
                
                this.mokDeviceInfo[address - 1] = {
                    type: deviceType,
                    address: address
                };
            }
        });
        
        this.updateMokIndicatorsView();
        this.updateMokAddressTree();
        this.showToast('success', `Сканирование завершено. Найдено ${respondingAddresses.length} устройств`);
    }

    createMokSection() {
        // Initialize sections array if not exists
        if (!this.mokSections) {
            this.mokSections = [];
        }
        
        // Check limit of 50 sections
        if (this.mokSections.length >= 50) {
            this.showToast('warning', 'Достигнуто максимальное количество разделов (50)');
            return;
        }
        
        // Create new section with auto-incrementing ID
        const maxId = this.mokSections.length > 0 ? Math.max(...this.mokSections.map(s => s.id)) : 0;
        const sectionId = maxId + 1;
        const newSection = {
            id: sectionId,
            name: `Раздел ${sectionId}`,
            addresses: [],
            createdAt: new Date().toISOString()
        };
        
        this.mokSections.push(newSection);
        this.updateMokAddressTree();
        
        // Auto-save configuration
        this.saveMokConfigAuto();
        
        this.showToast('success', `Создан новый раздел: ${newSection.name}`);
    }

    deleteMokSection() {
        if (!this.mokSections || this.mokSections.length === 0) {
            this.showToast('warning', 'Нет разделов для удаления');
            return;
        }
        
        // Get selected section (if any)
        const selectedNode = this.mokAddressTree?.querySelector('.mok-tree-node.selected');
        if (!selectedNode) {
            this.showToast('warning', 'Выберите раздел для удаления');
            return;
        }
        
        const sectionId = parseInt(selectedNode.getAttribute('data-section-id'));
        if (sectionId) {
            // Remove section by ID
            this.mokSections = this.mokSections.filter(section => section.id !== sectionId);
            this.updateMokAddressTree();
            
            // Auto-save configuration
            this.saveMokConfigAuto();
            
            this.showToast('info', 'Раздел удален');
        } else {
            this.showToast('warning', 'Выбранный элемент не является разделом');
        }
    }

    editMokSectionName(sectionId) {
        const section = this.mokSections.find(s => s.id === sectionId);
        if (!section) {
            this.showToast('error', 'Раздел не найден');
            return;
        }

        // Create modal dialog for editing section name
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        
        const modalContent = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h3>Редактировать название раздела</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label for="section-name-input">Название раздела:</label>
                        <input type="text" id="section-name-input" class="form-input" value="${section.name}" maxlength="50">
                    </div>
                </div>
                <div class="modal-footer">
                    <button id="cancel-edit-section" class="btn btn-secondary">Отмена</button>
                    <button id="save-edit-section" class="btn btn-primary">Сохранить</button>
                </div>
            </div>
        `;
        
        modal.innerHTML = modalContent;
        document.body.appendChild(modal);

        // Focus on input
        const input = modal.querySelector('#section-name-input');
        input.focus();
        input.select();

        // Handle events
        const closeModal = () => {
            document.body.removeChild(modal);
        };

        modal.querySelector('.modal-close').addEventListener('click', closeModal);
        modal.querySelector('#cancel-edit-section').addEventListener('click', closeModal);
        
        modal.querySelector('#save-edit-section').addEventListener('click', () => {
            const newName = input.value.trim();
            if (!newName) {
                this.showToast('warning', 'Название раздела не может быть пустым');
                return;
            }
            
            if (newName.length > 50) {
                this.showToast('warning', 'Название раздела не может быть длиннее 50 символов');
                return;
            }

            // Check for duplicate names
            const duplicateSection = this.mokSections.find(s => s.id !== sectionId && s.name === newName);
            if (duplicateSection) {
                this.showToast('warning', 'Раздел с таким названием уже существует');
                return;
            }

            // Update section name
            section.name = newName;
            this.updateMokAddressTree(this.mokSelectedAddress);
            
            // Auto-save configuration
            this.saveMokConfigAuto();
            
            this.showToast('success', `Название раздела изменено на "${newName}"`);
            closeModal();
        });

        // Handle Enter key
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#save-edit-section').click();
            } else if (e.key === 'Escape') {
                closeModal();
            }
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }

    // Drag and Drop Functions
    handleDragStart(e, address) {
        this.draggedAddress = address;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', address.toString());
        
        // Add visual feedback
        e.target.classList.add('dragging');
        
        // Highlight all drop zones
        this.highlightDropZones(true);
    }

    handleDragEnd(e) {
        // Remove visual feedback
        e.target.classList.remove('dragging');
        
        // Remove drop zone highlighting
        this.highlightDropZones(false);
        
        this.draggedAddress = null;
    }

    setupSectionDropZones() {
        if (!this.mokAddressTree) return;

        // Find all section nodes
        const sectionNodes = this.mokAddressTree.querySelectorAll('.mok-tree-node.section');
        
        sectionNodes.forEach(sectionNode => {
            // Add drop event listeners (bind to this to maintain context)
            sectionNode.addEventListener('dragover', this.handleDragOver.bind(this));
            sectionNode.addEventListener('drop', this.handleDrop.bind(this));
            sectionNode.addEventListener('dragenter', this.handleDragEnter.bind(this));
            sectionNode.addEventListener('dragleave', this.handleDragLeave.bind(this));
        });

        // Also make the entire tree a drop zone for removing addresses from sections
        this.mokAddressTree.addEventListener('dragover', this.handleTreeDragOver.bind(this));
        this.mokAddressTree.addEventListener('drop', this.handleTreeDrop.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        const sectionNode = e.currentTarget.closest('.mok-tree-node.section');
        if (sectionNode) {
            sectionNode.classList.add('drag-over');
        }
    }

    handleDragLeave(e) {
        const sectionNode = e.currentTarget.closest('.mok-tree-node.section');
        if (sectionNode && !sectionNode.contains(e.relatedTarget)) {
            sectionNode.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        
        const sectionNode = e.currentTarget.closest('.mok-tree-node.section');
        if (!sectionNode) return;
        
        const sectionId = parseInt(sectionNode.getAttribute('data-section-id'));
        const address = parseInt(e.dataTransfer.getData('text/plain'));
        
        if (!isNaN(sectionId) && !isNaN(address)) {
            this.moveAddressToSection(address, sectionId);
            this.updateMokAddressTree(this.mokSelectedAddress);
        }
        
        sectionNode.classList.remove('drag-over');
    }

    handleTreeDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleTreeDrop(e) {
        e.preventDefault();
        
        // Check if dropping on empty area (not on a section)
        if (!e.target.closest('.mok-tree-node.section')) {
            const address = parseInt(e.dataTransfer.getData('text/plain'));
            if (!isNaN(address)) {
                // Remove from all sections
                this.moveAddressToSection(address, null);
                this.updateMokAddressTree(this.mokSelectedAddress);
            }
        }
    }

    highlightDropZones(highlight) {
        if (!this.mokAddressTree) return;
        
        const sectionNodes = this.mokAddressTree.querySelectorAll('.mok-tree-node.section');
        sectionNodes.forEach(node => {
            if (highlight) {
                node.classList.add('drop-zone-active');
            } else {
                node.classList.remove('drop-zone-active', 'drag-over');
            }
        });
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
