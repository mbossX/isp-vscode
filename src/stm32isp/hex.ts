/* eslint-disable no-throw-literal */
import * as fs from 'fs';

function nextLine(buf: string, from: number) {
  for (let i = from; i < buf.length; i++) {
    if (buf[i] === ':') {
      const line = {
        index: i,
        size: parseInt('0x' + buf.substring(i + 1, i + 3)),
        address: parseInt('0x' + buf.substring(i + 3, i + 7)),
        type: parseInt('0x' + buf.substring(i + 7, i + 9)),
        data: [] as number[]
      };
      for (let j = 0; j < line.size; j++) {
        line.data.push(parseInt('0x' + buf.substring(i + 9 + 2 * j, i + 9 + 2 * j + 2)));
      }
      return line;
    }
  }
  return null;
}

function getLine(buf: string, type: number, from: number) {
  while (from < buf.length) {
    const line = nextLine(buf, from);
    if (!line) {
      throw 'can not get line ' + type + ' from ' + from;
    }
    if (line.type === type) {
      return line;
    }
    from += line.size + 10;
  }
  throw 'can not get line ' + type + ' from ' + from;
}

function hex2bin(hpath: string) {
  const buf = fs.readFileSync(hpath, { encoding: 'ascii' });
  let line = getLine(buf, 4, 0);
  let address = (line.data[0] << 8) + line.data[1];
  line = getLine(buf, 0, 12);
  address = (address << 16) + line.address;
  if (address !== 0x08000000) {
    throw 'base address is not 0x08000000';
  }
  const data = [];
  for (let i = 0; i < buf.length;) {
    try {
      line = getLine(buf, 0, i);
      data.push(...line.data);
      i = line.index + line.size + 10;
    } catch {
      break;
    }
  }
  return data;
}

export default hex2bin;
