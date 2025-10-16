/**
 * Утилиты для работы с RS485 протоколом
 */

class RS485Utils {
    /**
     * Создать команду для записи параметров
     * @param {number} address - Адрес устройства
     * @param {object} parameters - Параметры для записи
     * @returns {string} Команда в формате протокола
     */
    static createWriteCommand(address, parameters) {
        // Пример протокола: WRITE:ADDRESS:PARAM1=VALUE1,PARAM2=VALUE2
        const paramString = Object.entries(parameters)
            .map(([key, value]) => `${key}=${value}`)
            .join(',');
        
        return `WRITE:${address}:${paramString}`;
    }

    /**
     * Создать команду для чтения параметров
     * @param {number} address - Адрес устройства
     * @returns {string} Команда чтения
     */
    static createReadCommand(address) {
        return `READ:${address}`;
    }

    /**
     * Создать команду для тестирования устройства
     * @param {number} address - Адрес устройства
     * @returns {string} Команда теста
     */
    static createTestCommand(address) {
        return `TEST:${address}`;
    }

    /**
     * Парсить ответ от устройства
     * @param {string} response - Ответ от устройства
     * @returns {object} Распарсенный ответ
     */
    static parseResponse(response) {
        try {
            // Пример формата ответа: OK:ADDRESS:PARAM1=VALUE1,PARAM2=VALUE2
            const parts = response.split(':');
            
            if (parts.length < 2) {
                return { success: false, error: 'Invalid response format' };
            }

            const status = parts[0];
            const address = parseInt(parts[1]);
            
            if (status === 'OK') {
                const parameters = {};
                if (parts.length > 2) {
                    const paramString = parts.slice(2).join(':');
                    paramString.split(',').forEach(param => {
                        const [key, value] = param.split('=');
                        if (key && value) {
                            parameters[key] = value;
                        }
                    });
                }
                
                return {
                    success: true,
                    address: address,
                    parameters: parameters
                };
            } else if (status === 'ERROR') {
                return {
                    success: false,
                    address: address,
                    error: parts[2] || 'Unknown error'
                };
            } else {
                return {
                    success: false,
                    error: 'Unknown status: ' + status
                };
            }
        } catch (error) {
            return {
                success: false,
                error: 'Parse error: ' + error.message
            };
        }
    }

    /**
     * Проверить валидность адреса устройства
     * @param {number} address - Адрес для проверки
     * @returns {boolean} Валидность адреса
     */
    static isValidAddress(address) {
        return Number.isInteger(address) && address >= 1 && address <= 247;
    }

    /**
     * Создать команду для сброса устройства
     * @param {number} address - Адрес устройства
     * @returns {string} Команда сброса
     */
    static createResetCommand(address) {
        return `RESET:${address}`;
    }

    /**
     * Создать команду для получения статуса устройства
     * @param {number} address - Адрес устройства
     * @returns {string} Команда статуса
     */
    static createStatusCommand(address) {
        return `STATUS:${address}`;
    }

    /**
     * Вычислить контрольную сумму для команды
     * @param {string} command - Команда
     * @returns {string} Контрольная сумма
     */
    static calculateChecksum(command) {
        let checksum = 0;
        for (let i = 0; i < command.length; i++) {
            checksum ^= command.charCodeAt(i);
        }
        return checksum.toString(16).toUpperCase().padStart(2, '0');
    }

    /**
     * Создать команду с контрольной суммой
     * @param {string} command - Базовая команда
     * @returns {string} Команда с контрольной суммой
     */
    static createCommandWithChecksum(command) {
        const checksum = this.calculateChecksum(command);
        return `${command}:${checksum}`;
    }

    /**
     * Проверить контрольную сумму в ответе
     * @param {string} response - Ответ с контрольной суммой
     * @returns {boolean} Корректность контрольной суммы
     */
    static verifyChecksum(response) {
        const lastColonIndex = response.lastIndexOf(':');
        if (lastColonIndex === -1) return false;
        
        const command = response.substring(0, lastColonIndex);
        const receivedChecksum = response.substring(lastColonIndex + 1);
        const calculatedChecksum = this.calculateChecksum(command);
        
        return receivedChecksum.toUpperCase() === calculatedChecksum;
    }

    /**
     * Форматировать данные для лога
     * @param {string} direction - Направление (TX/RX)
     * @param {string} data - Данные
     * @param {Date} timestamp - Время
     * @returns {string} Отформатированная строка лога
     */
    static formatLogEntry(direction, data, timestamp = new Date()) {
        const timeStr = timestamp.toLocaleTimeString();
        return `[${timeStr}] ${direction}: ${data}`;
    }

    /**
     * Создать команду для настройки скорости передачи
     * @param {number} address - Адрес устройства
     * @param {number} baudRate - Скорость передачи
     * @returns {string} Команда настройки
     */
    static createBaudRateCommand(address, baudRate) {
        return `SETBAUD:${address}:${baudRate}`;
    }

    /**
     * Создать команду для сканирования устройств
     * @returns {string} Команда сканирования
     */
    static createScanCommand() {
        return 'SCAN';
    }

    /**
     * Обработать ответ сканирования
     * @param {string} response - Ответ сканирования
     * @returns {Array} Массив найденных адресов
     */
    static parseScanResponse(response) {
        try {
            // Пример: SCAN:1,2,5,10
            if (response.startsWith('SCAN:')) {
                const addressesStr = response.substring(5);
                return addressesStr.split(',')
                    .map(addr => parseInt(addr.trim()))
                    .filter(addr => !isNaN(addr));
            }
            return [];
        } catch (error) {
            return [];
        }
    }
}

module.exports = RS485Utils;
