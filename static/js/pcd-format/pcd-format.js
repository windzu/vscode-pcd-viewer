import { ab2str, str2ab, getWithTypeFromText, getWithTypeFromDataView, setWithTypeToDataView } from './utils.js';
import { compress, decompress } from './lzf.js';

// TypedArray constructors for each PCD type and size
const TypedArrayMap = {
    'F4': Float32Array,
    'F8': Float64Array,
    'U1': Uint8Array,
    'U2': Uint16Array,
    'U4': Uint32Array,
    'I1': Int8Array,
    'I2': Int16Array,
    'I4': Int32Array,
};

function asBytes(input) {
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error('PCD-Format: expected an ArrayBuffer or typed array');
}

// A binary payload is never text. Stop scanning at the DATA line and preserve
// the byte offset, including CRLF and non-ASCII header comments.
export function readHeader(input) {
    const bytes = asBytes(input);
    const decoder = new TextDecoder();
    let start = 0;
    for (let end = 0; end < Math.min(bytes.length, 1024 * 1024); end++) {
        if (bytes[end] !== 10) continue;
        const line = decoder.decode(bytes.subarray(start, end)).trim();
        if (/^DATA\s+\S+$/i.test(line)) {
            const header = parseHeader(decoder.decode(bytes.subarray(0, end + 1)));
            header.headerLength = end + 1;
            validateHeader(header);
            return header;
        }
        start = end + 1;
    }
    throw new Error('PCD-Format: missing DATA line or header exceeds 1 MiB');
}

function validateHeader(header) {
    const n = header.fields && header.fields.length;
    if (!n || !['ascii', 'binary', 'binary_compressed'].includes(header.data)) {
        throw new Error('PCD-Format: missing fields or unsupported DATA format');
    }
    if (!header.size || !header.type || !header.count ||
        [header.size, header.type, header.count].some(values => values.length !== n) ||
        new Set(header.fields).size !== n) {
        throw new Error('PCD-Format: inconsistent field metadata');
    }
    for (let j = 0; j < n; j++) {
        if (!TypedArrayMap[header.type[j] + header.size[j]] ||
            !Number.isSafeInteger(header.count[j]) || header.count[j] < 1) {
            throw new Error('PCD-Format: unsupported field type, size or count');
        }
    }
    if (!Number.isSafeInteger(header.points) || header.points < 0 ||
        !Number.isSafeInteger(header.width) || header.width < 0 ||
        !Number.isSafeInteger(header.height) || header.height < 1 ||
        header.width * header.height !== header.points ||
        !Number.isSafeInteger(header.rowSize * header.points)) {
        throw new Error('PCD-Format: invalid point count or dimensions');
    }
}

function binaryData(bytes, header, littleEndian) {
    const offset = header.headerLength;
    const expected = header.size.reduce((sum, size, j) => sum + size * header.count[j], 0) * header.points;
    if (header.data === 'binary') {
        if (bytes.length - offset < expected) throw new Error('PCD-Format: truncated binary payload');
        return new DataView(bytes.buffer, bytes.byteOffset + offset, expected);
    }
    if (bytes.length - offset < 8) throw new Error('PCD-Format: missing compressed sizes');
    const sizes = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const compressedSize = sizes.getUint32(0, littleEndian);
    const decompressedSize = sizes.getUint32(4, littleEndian);
    if (decompressedSize !== expected || compressedSize > bytes.length - offset - 8) {
        throw new Error('PCD-Format: invalid compressed sizes');
    }
    if (expected > 512 * 1024 * 1024) {
        throw new Error('PCD-Format: decompressed data exceeds the 512 MiB safety limit');
    }
    return new DataView(decompress(bytes.subarray(offset + 8, offset + 8 + compressedSize), expected));
}

// Include both endpoints so a preview spans the complete input record.
export function sourcePointIndex(index, sourceCount, previewCount) {
    if (sourceCount === previewCount) return index;
    return previewCount <= 1 ? 0 : Math.floor(index * (sourceCount - 1) / (previewCount - 1));
}

function parseHeader(textData) {

    let header = {};
    let dataStart = textData.search(/[\r\n]DATA\s(\S*)[\f\r\t\v]*\n/i);
    if (dataStart == -1) {
        throw "PCD-Format: not found DATA";
    }

    let result = /[\r\n]DATA\s(\S*)[\f\r\t\v]*\n/i.exec(textData);
    header.raw = textData.substr(0, dataStart + result[0].length);
    header.str = header.raw.replace(/\#.*/gi, '');

    // parse
    header.version = /VERSION (.*)/i.exec(header.str);
    header.fields = /FIELDS (.*)/i.exec(header.str);
    header.size = /SIZE (.*)/i.exec(header.str);
    header.type = /TYPE (.*)/i.exec(header.str);
    header.count = /COUNT (.*)/i.exec(header.str);
    header.width = /WIDTH (.*)/i.exec(header.str);
    header.height = /HEIGHT (.*)/i.exec(header.str);
    header.viewpoint = /VIEWPOINT (.*)/i.exec(header.str);
    header.points = /POINTS (.*)/i.exec(header.str);
    header.data = /DATA (.*)/i.exec(header.str);

    // evaluate
    if (header.version !== null)
        header.version = parseFloat(header.version[1]);

    if (header.fields !== null)
        header.fields = header.fields[1].trim().split(/\s+/);

    if (header.type !== null)
        header.type = header.type[1].trim().split(/\s+/);

    if (header.width !== null)
        header.width = parseInt(header.width[1]);

    if (header.height !== null)
        header.height = parseInt(header.height[1]);

    if (header.viewpoint !== null)
        header.viewpoint = header.viewpoint[1].trim().split(/\s+/).map(parseFloat);

    if (header.points !== null)
        header.points = parseInt(header.points[1], 10);

    if (header.points === null)
        header.points = header.width * header.height;

    if (header.data !== null)
        header.data = header.data[1].trim().toLowerCase();

    if (header.size !== null) {
        header.size = header.size[1].trim().split(/\s+/).map(function (x) {
            return parseInt(x, 10);
        });
    }

    if (header.count !== null) {
        header.count = header.count[1].trim().split(/\s+/).map(function (x) {
            return parseInt(x, 10);
        });
    } else {
        header.count = [];
        for (let i = 0, l = header.fields.length; i < l; i++) {
            header.count.push(1);
        }
    }

    header.offset = [];
    let sizeSum = 0;
    for (let i = 0, l = header.fields.length; i < l; i++) {
        header.offset.push(sizeSum);
        if (header.data === 'ascii') {
            sizeSum += header.count[i];
        } else {
            sizeSum += header.size[i] * header.count[i];
        }
    }

    // for binary only
    header.rowSize = sizeSum;

    return header;
}

function getPointsFromTextData(textData, header, asList = true) {
    let points = [];

    let lines = textData.split('\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i] === '')
            continue;
        let line = lines[i].split(' ');
        let point = asList ? [] : {};
        for (let j = 0; j < header.fields.length; j++) {
            const type = header.type[j];
            const count = header.count[j];
            const offset = header.offset[j];
            let item;
            if (count == 1) {
                const text = line[offset];
                item = getWithTypeFromText(text, type);
            } else if (count > 1) {
                item = [];
                for (let c = 0; c < count; c++) {
                    const text = line[offset + c];
                    item.push(getWithTypeFromText(text, type));
                }
            }
            if (asList) {
                point.push(item);
            } else {
                point[header.fields[j]] = item;
            }
        }
        points.push(point);
    }
    return points;
}

function setPointsToTextData(points, header, asList = true) {
    let textData = '';
    for (let i = 0; i < points.length; i++) {
        if (asList) {
            textData += points[i].map(p => p instanceof Array ? p.join(' ') : p).join(' ');
        } else {
            textData += header.fields.map((f) => (points[i][f] instanceof Array) ? points[i][f].join(' ') : points[i][f]).join(' ');
        }
        textData += '\n';
    }
    return textData;
}

function getPointsFromDataView(dataview, header, asList = true, littleEndian = true, columnar = false) {
    let points = [];

    for (let i = 0; i < header.points; i++) {
        let point = asList ? [] : {};

        for (let j = 0; j < header.fields.length; j++) {
            const type = header.type[j];
            const size = header.size[j];
            const count = header.count[j];
            let offset, item;

            if (count == 1) {
                if (columnar) {
                    offset = header.offset[j] * header.points + i * size;
                } else {
                    offset = i * header.rowSize + header.offset[j];
                }
                item = getWithTypeFromDataView(dataview, offset, littleEndian, type, size);
            } else if (count > 1) {
                item = [];
                for (let c = 0; c < count; c++) {
                    if (columnar) {
                    offset = header.offset[j] * header.points + (i * count + c) * size;
                    } else {
                        offset = i * header.rowSize + header.offset[j] + c * size;
                    }
                    item.push(getWithTypeFromDataView(dataview, offset, littleEndian, type, size));
                }
            }
            if (asList) {
                point.push(item);
            } else {
                point[header.fields[j]] = item;
            }
        }
        points.push(point);
    }
    return points;
}

function setPointsToDataView(points, dataview, header, asList = true, littleEndian = true, columnar = false) {

    for (let i = 0; i < points.length; i++) {
        const point = points[i];
        for (let j = 0; j < header.fields.length; j++) {
            const type = header.type[j];
            const size = header.size[j];
            const count = header.count[j];
            let offset;

            if (count == 1) {
                if (columnar) {
                    offset = header.offset[j] * header.points + i * size;
                } else {
                    offset = i * header.rowSize + header.offset[j];
                }
                if (asList) {
                    setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[j]);
                } else {
                    setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[header.fields[j]]);
                }
            } else if (count > 1) {
                for (let c = 0; c < count; c++) {
                    if (columnar) {
                        offset = (header.offset[j] + c * size) * header.points + i * size;
                    } else {
                        offset = i * header.rowSize + header.offset[j] + c * size;
                    }
                    if (asList) {
                        setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[j][c]);
                    } else {
                        setWithTypeToDataView(dataview, offset, littleEndian, type, size, point[header.fields[j]][c]);
                    }
                }
            } else {
                throw "PCD-Format: set data failed";
            }
        }
    }
}

/**
 * Parse ArrayBuffer and return PCD Header and Points
 * @param {ArrayBuffer} arrayBuffer 
 * @param {boolean} asList 
 * @param {boolean} littleEndian
 * 
 * @returns {Object} 
 */
export function parse(arrayBuffer, asList = true, littleEndian = true) {
    const bytes = asBytes(arrayBuffer);
    const header = readHeader(bytes);

    // parse data
    let points = [];

    if (header.data === 'ascii') {

        let pcdData = new TextDecoder().decode(bytes.subarray(header.headerLength));
        points = getPointsFromTextData(pcdData, header, asList);

    } else if (header.data === 'binary') {

        let dataview = binaryData(bytes, header, littleEndian);
        points = getPointsFromDataView(dataview, header, asList, littleEndian, false);

    } else if (header.data === 'binary_compressed') {

        const dataview = binaryData(bytes, header, littleEndian);
        points = getPointsFromDataView(dataview, header, asList, littleEndian, true);

    }

    return {
        header,
        points
    }
};

/**
 * Fast parse using TypedArrays for better performance with large point clouds.
 * Returns data as TypedArrays per field instead of array of point objects.
 * @param {ArrayBuffer} arrayBuffer 
 * @param {boolean} littleEndian
 * 
 * @returns {Object} { header, fieldData: { fieldName: TypedArray, ... }, points: number }
 */
export function parseFast(arrayBuffer, littleEndian = true, options = {}) {
    const bytes = asBytes(arrayBuffer);
    const header = readHeader(bytes);
    const maxPoints = options.maxPoints === undefined || options.maxPoints === 0 ? Infinity : options.maxPoints;
    if (!(maxPoints === Infinity || (Number.isSafeInteger(maxPoints) && maxPoints > 0))) {
        throw new Error('PCD-Format: maxPoints must be a positive integer');
    }
    const rowBytes = header.size.reduce((sum, size, j) => sum + size * header.count[j], 0);
    const memoryLimit = maxPoints === Infinity ? Infinity : Math.floor(64 * 1024 * 1024 / rowBytes);
    const numPoints = Math.min(header.points, maxPoints, memoryLimit);
    if (header.points > 0 && numPoints < 1) throw new Error('PCD-Format: a point exceeds the preview memory budget');
    // Validate/decompress before allocating field arrays.
    const dataview = header.data === 'ascii' ? null : binaryData(bytes, header, littleEndian);
    const fieldData = Object.create(null);
    for (let j = 0; j < header.fields.length; j++) {
        const fieldName = header.fields[j];
        const type = header.type[j];
        const size = header.size[j];
        const count = header.count[j];
        fieldData[fieldName] = new TypedArrayMap[type + size](numPoints * count);
    }
    if (header.data === 'ascii') {
        parseAsciiToTypedArrays(bytes, header, fieldData, numPoints, options.onProgress);
    } else {
        parseBinaryToTypedArrays(dataview, header, fieldData, littleEndian,
            header.data === 'binary_compressed', numPoints, options.onProgress);
    }
    return { header, fieldData, points: numPoints, sourcePoints: header.points };
}

function parseAsciiToTypedArrays(bytes, header, fieldData, numPoints, onProgress) {
    const decoder = new TextDecoder();
    let pointIndex = 0;
    let sampleIndex = 0;
    let lineStart = header.headerLength;
    for (let end = lineStart; end <= bytes.length; end++) {
        if (end < bytes.length && bytes[end] !== 10) continue;
        const line = bytes.subarray(lineStart, end);
        lineStart = end + 1;
        let first = 0;
        while (first < line.length && line[first] <= 32) first++;
        if (first === line.length || line[first] === 35) continue;
        if (pointIndex >= header.points) throw new Error('PCD-Format: too many ASCII points');
        if (sampleIndex < numPoints && pointIndex === sourcePointIndex(sampleIndex, header.points, numPoints)) {
            const values = decoder.decode(line).trim().split(/\s+/);
            if (values.length !== header.rowSize) throw new Error('PCD-Format: incomplete ASCII point');
            for (let j = 0; j < header.fields.length; j++) {
                const count = header.count[j];
                for (let c = 0; c < count; c++) {
                    fieldData[header.fields[j]][sampleIndex * count + c] = getWithTypeFromText(
                        values[header.offset[j] + c], header.type[j]);
                }
            }
            sampleIndex++;
        }
        pointIndex++;
        if (onProgress && pointIndex % 100000 === 0) onProgress(pointIndex / header.points);
    }
    if (pointIndex !== header.points) throw new Error('PCD-Format: truncated ASCII payload');
    if (onProgress) onProgress(1);
}

function parseBinaryToTypedArrays(dataview, header, fieldData, littleEndian, columnar, numPoints, onProgress) {
    for (let j = 0; j < header.fields.length; j++) {
        const fieldName = header.fields[j];
        const type = header.type[j];
        const size = header.size[j];
        const count = header.count[j];
        const arr = fieldData[fieldName];
        for (let i = 0; i < numPoints; i++) {
            const sourceIndex = sourcePointIndex(i, header.points, numPoints);
            if (count === 1) {
                let offset;
                if (columnar) {
                    offset = header.offset[j] * header.points + sourceIndex * size;
                } else {
                    offset = sourceIndex * header.rowSize + header.offset[j];
                }
                arr[i] = getWithTypeFromDataView(dataview, offset, littleEndian, type, size);
            } else {
                for (let c = 0; c < count; c++) {
                    let offset;
                    if (columnar) {
                        offset = header.offset[j] * header.points + (sourceIndex * count + c) * size;
                    } else {
                        offset = sourceIndex * header.rowSize + header.offset[j] + c * size;
                    }
                    arr[i * count + c] = getWithTypeFromDataView(dataview, offset, littleEndian, type, size);
                }
            }
        }
        if (onProgress) onProgress((j + 1) / header.fields.length);
    }
}

/**
 * Stringify PCD and return ArrayBuffer
 * @param {Object} header 
 * @param {Array} points 
 * @param {boolean} asList 
 * @param {boolean} littleEndian 
 * 
 * @returns {ArrayBuffer}
 */
export function stringify(header, points, asList = true, littleEndian = true) {

    if (header.data === 'ascii') {
        let textData = '' + header.raw;
        textData += setPointsToTextData(points, header, asList);
        return str2ab(textData);

    } else if (header.data === 'binary') {

        const bufferSize = header.raw.length + header.points * header.rowSize;
        const arrayBuffer = new ArrayBuffer(bufferSize);

        // write header
        const headerView = new Uint8Array(arrayBuffer, 0, header.raw.length);
        for (let i = 0; i < header.raw.length; i++) {
            headerView[i] = header.raw.charCodeAt(i);
        }

        // write data
        const dataview = new DataView(arrayBuffer, header.raw.length);
        setPointsToDataView(points, dataview, header, asList, littleEndian, false);

        return arrayBuffer;
    } else if (header.data === 'binary_compressed') {

        // write data
        const dataArrayBuffer = new ArrayBuffer(header.points * header.rowSize);
        const dataview = new DataView(dataArrayBuffer);
        setPointsToDataView(points, dataview, header, asList, littleEndian, true);
        const compressed = compress(dataArrayBuffer);

        const arrayBuffer = new ArrayBuffer(header.raw.length + 8 + compressed.byteLength)

        // write header
        const headerView = new Uint8Array(arrayBuffer, 0, header.raw.length);
        for (let i = 0; i < header.raw.length; i++) {
            headerView[i] = header.raw.charCodeAt(i);
        }

        // write size
        const sizes = new DataView(arrayBuffer, header.raw.length, 8);
        sizes.setInt32(0, compressed.byteLength, littleEndian);
        sizes.setInt32(4, header.points * header.rowSize, littleEndian);

        // write data
        const tmp = new Uint8Array(arrayBuffer);
        tmp.set(new Uint8Array(compressed), header.raw.length + 8);

        return arrayBuffer;
    }
}
