/* eslint-disable no-throw-literal */
import * as SerialPort from 'serialport';
import * as fs from 'fs';
import * as vscode from 'vscode';
import hex2bin from './hex';

export default class Stm32Isp {
  private port!: any;
  private lastData = [] as number[];
  private dataResolve: ((data: number[]) => void) | null = null;
  private hexData: number[] = [];
  private channel!: vscode.OutputChannel;

  constructor(ch: vscode.OutputChannel) {
    this.channel = ch;
    const cfg = vscode.workspace.getConfiguration('isp');
    const hexPath = cfg.get('hex') as string;
    const comPort = cfg.get('com') as string || 'COM3';
    const baudRate = cfg.get('baud') as number || 115200;
    
    if (!hexPath) {
      throw 'can not get hex file path';
    }
    if (!fs.existsSync(hexPath)) {
      throw `hex ${hexPath} not exists`;
    }
    this.hexData = hex2bin(hexPath);

    this.port = new SerialPort(comPort, {
      baudRate,
      parity: 'even',
      dataBits: 8,
      stopBits: 1,
      autoOpen: false
    });

    this.port.on('data', (data: number[]) => {
      this.dataResolve?.(data);
    });
  }

  private waitAck(timeout = 3000) {
    return new Promise(res => {
      const timer = setTimeout(() => {
        this.dataResolve = null;
        res(false);
      }, timeout);
      this.dataResolve = (data) => {
        clearTimeout(timer);
        this.lastData = [...data];
        res(data[0] === 0x79);
      };
    });
  }

  private open() {
    return new Promise(res => {
      this.port.open((err: string) => {
        res(!err);
      });
    });
  }

  private checksum(data: number[]) {
    let cs = 0;
    for (let i = 0; i < data.length; i++) { cs ^= data[i]; }
    return cs;
  }

  private async sync() {
    this.channel.appendLine('get syncing...');
    while (true) {
      this.port.write([0x7F]);
      if (!await this.waitAck(1000)) {
        this.channel.appendLine('please reset board, try again');
        continue;
      } else {
        break;
      }
    }
  }

  private async getVersion() {
    this.port.write([0x00]);
    this.port.write([0xff]);
    if (!await this.waitAck()) {
      throw 'get cmd timeout';
    }
    if (this.lastData[1] === 11) {
      this.channel.appendLine(`version: ${this.lastData[2] >> 4}.${this.lastData[2] & 0x0F}`);
    } else {
      throw 'get cmd error: ' + this.lastData.join(',');
    }
  }

  private async getID() {
    this.port.write([0x02]);
    this.port.write([0xfd]);
    if (!await this.waitAck()) {
      throw 'get id timeout';
    }
    if (this.lastData[1] === 1) {
      this.channel.appendLine(`pid: 0x${this.lastData[2].toString(16)}${this.lastData[3].toString(16)}`);
    } else {
      throw 'get id error: ' + this.lastData.join(',');
    }
  }

  private async erase() {
    this.channel.appendLine('erase all');
    this.port.write([0x43]);
    this.port.write([0xbc]);
    if (!await this.waitAck()) {
      throw 'erase timeout';
    }
    this.port.write([0xff]);
    this.port.write([0x00]);
    if (!await this.waitAck()) {
      throw 'erase timeout';
    }
  }

  private async write() {
    this.channel.appendLine('writing...');
    let addr = 0x08000000;
    let temp = [];
    let len = 256;
    for (let i = 0; i < this.hexData.length;) {
      temp[0] = ((addr >> 24) & 0xff);
      temp[1] = ((addr >> 16) & 0xff);
      temp[2] = ((addr >> 8) & 0xff);
      temp[3] = ((addr) & 0xff);

      this.port.write([0x31]);
      this.port.write([0xce]);
      if (!await this.waitAck()) {
        throw 'write data error';
      }
      this.port.write(temp);
      this.port.write([this.checksum(temp)]);
      if (!await this.waitAck()) {
        throw 'write data error';
      }
      len = Math.min(256, this.hexData.length - i);
      //下面发送数据
      this.port.write([len - 1]);
      this.port.write(this.hexData.slice(i, i + len));
      this.port.write([(len - 1) ^ this.checksum(this.hexData.slice(i, i + len))]);
      if (!await this.waitAck()) {
        throw 'write data error';
      }
      this.port.flush();
      addr += len;
      i += len;
    }
  }

  private async varify() {
    this.channel.appendLine('varifing');
    let addr = 0x08000000;
    let temp = [];
    let len = 256;
    for (let i = 0; i < this.hexData.length;) {
      temp[0] = ((addr >> 24) & 0xff);
      temp[1] = ((addr >> 16) & 0xff);
      temp[2] = ((addr >> 8) & 0xff);
      temp[3] = ((addr) & 0xff);

      this.port.write([0x11]);
      this.port.write([0xEE]);
      if (!await this.waitAck()) {
        throw 'read data error';
      }
      this.port.write(temp);
      this.port.write([this.checksum(temp)]);
      if (!await this.waitAck()) {
        throw 'read data error';
      }
      len = Math.min(256, this.hexData.length - i);
      //下面发送数据
      this.port.write([len - 1]);
      this.port.write([~(len - 1)]);
      if (!await this.waitAck()) {
        throw 'read data error';
      }
      for (let j = 0; j < len; j++) {
        if (this.hexData[i + j] !== this.lastData[1 + j]) {
          throw `varify ${i} ${this.lastData.length}: ${this.lastData.join(',')}`;
        }
      }
      addr += len;
      i += len;
    }
  }

  private async execute() {
    let temp = [];
    let addr = 0x08000000;
    temp[0] = ((addr >> 24) & 0xff);
    temp[1] = ((addr >> 16) & 0xff);
    temp[2] = ((addr >> 8) & 0xff);
    temp[3] = ((addr) & 0xff);

    this.port.write([0x21]);
    this.port.write([0xDE]);
    if (!await this.waitAck()) {
      throw 'execute error';
    }
    this.port.write(temp);
    this.port.write([this.checksum(temp)]);
    if (!await this.waitAck()) {
      throw 'execute error';
    }
    this.channel.appendLine('execute app from 0x08000000');
  }

  async run() {
    if (!await this.open()) {
      throw 'can not open serial port';
    }
    this.port.flush();
    await this.sync();
    await this.getVersion();
    await this.getID();
    await this.sleep(100);
    await this.erase();
    await this.sleep(100);
    await this.write();
    await this.sleep(100);
    await this.varify();
    await this.sleep(100);
    await this.execute();
  }

  close() {
    if (this.port.isOpen) {
      this.port.close();
    }
  }

  private sleep(ms: number) {
    return new Promise(res => {
      setTimeout(res, ms);
    });
  }
}
