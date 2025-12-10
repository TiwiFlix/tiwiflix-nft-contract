import { beginCell, BitBuilder, BitReader, Cell } from '@ton/core';

const OFFCHAIN_PREFIX = 0x01;

function bufferToChunks(buff: Buffer, chunkSize: number) {
  const chunks: Buffer[] = [];
  while (buff.byteLength > 0) {
    chunks.push(buff.subarray(0, chunkSize));
    buff = buff.subarray(chunkSize);
  }

  return chunks;
}

export function makeSnakeCell(data: Buffer): Cell {
  const chunks = bufferToChunks(data, 127);

  if (chunks.length === 0) {
    return beginCell().endCell();
  }

  if (chunks.length === 1) {
    return beginCell().storeBuffer(chunks[0]).endCell();
  }

  let curCell = beginCell();

  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];

    curCell.storeBuffer(chunk);

    if (i - 1 >= 0) {
      const nextCell = beginCell();
      nextCell.storeRef(curCell);
      curCell = nextCell;
    }
  }

  return curCell.endCell();
}

export function encodeOffChainContent(content: string): Cell {
  let data = Buffer.from(content);
  const offChainPrefix = Buffer.from([OFFCHAIN_PREFIX]); // mark that this is offchain content
  data = Buffer.concat([offChainPrefix, data]);
  return makeSnakeCell(data);
}

export function flattenSnakeCell(cell: Cell): Buffer {
  let c: Cell | null = cell;

  const bitResult = new BitBuilder();
  while (c) {
    const cs = c.beginParse();
    if (cs.remainingBits === 0) {
      break;
    }

    const data = cs.loadBits(cs.remainingBits);
    bitResult.writeBits(data);
    c = c.refs && c.refs[0];
  }

  const endBits = bitResult.build();
  const reader = new BitReader(endBits);

  return reader.loadBuffer(reader.remaining / 8);
}

export function decodeOffChainContent(content: Cell): string {
  const data = flattenSnakeCell(content);

  // Check for the standard offchain prefix 0x01
  if (data[0] === OFFCHAIN_PREFIX) {
    return data.subarray(1).toString();
  }
  
  // If no prefix, assume it's raw string data (which seems to be the case for our items)
  // Our items are stored as just "/nft.json" without the 0x01 prefix in the item content cell
  // because the COLLECTION data has the common content prefix.
  return data.toString();
}
