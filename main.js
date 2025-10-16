const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let mainWindow;
let serialPort = null;
let parser = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1050,
    minWidth: 1200,
    minHeight: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    titleBarStyle: 'default',
    resizable: true,
    show: false
  });

  mainWindow.loadFile('index.html');

  // Показать окно когда оно готово
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Открыть DevTools в режиме разработки
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC обработчики для работы с RS485
ipcMain.handle('get-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer || 'Unknown',
      serialNumber: port.serialNumber || 'N/A'
    }));
  } catch (error) {
    console.error('Error getting ports:', error);
    return [];
  }
});

ipcMain.handle('connect-port', async (event, portPath, baudRate) => {
  try {
    if (serialPort && serialPort.isOpen) {
      await serialPort.close();
    }

    serialPort = new SerialPort({
      path: portPath,
      baudRate: parseInt(baudRate),
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      flowControl: false
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    return new Promise((resolve, reject) => {
      serialPort.on('open', () => {
        console.log('Port opened:', portPath);
        resolve({ success: true, message: 'Connected successfully' });
      });

      serialPort.on('error', (error) => {
        console.error('Port error:', error);
        reject({ success: false, message: error.message });
      });

      parser.on('data', (data) => {
        mainWindow.webContents.send('serial-data', data);
      });
    });
  } catch (error) {
    console.error('Connection error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('disconnect-port', async () => {
  try {
    if (serialPort && serialPort.isOpen) {
      await serialPort.close();
      serialPort = null;
      parser = null;
      return { success: true, message: 'Disconnected successfully' };
    }
    return { success: true, message: 'Already disconnected' };
  } catch (error) {
    console.error('Disconnection error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('send-command', async (event, command) => {
  try {
    if (serialPort && serialPort.isOpen) {
      serialPort.write(command + '\r\n');
      return { success: true };
    } else {
      return { success: false, message: 'Port not connected' };
    }
  } catch (error) {
    console.error('Send command error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('write-parameters', async (event, address, parameters) => {
  try {
    if (serialPort && serialPort.isOpen) {
      // Пример команды записи параметров
      const command = `WRITE:${address}:${JSON.stringify(parameters)}`;
      serialPort.write(command + '\r\n');
      return { success: true };
    } else {
      return { success: false, message: 'Port not connected' };
    }
  } catch (error) {
    console.error('Write parameters error:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('test-device', async (event, address) => {
  try {
    if (serialPort && serialPort.isOpen) {
      // Команда для тестирования устройства
      const command = `TEST:${address}`;
      serialPort.write(command + '\r\n');
      return { success: true };
    } else {
      return { success: false, message: 'Port not connected' };
    }
  } catch (error) {
    console.error('Test device error:', error);
    return { success: false, message: error.message };
  }
});
