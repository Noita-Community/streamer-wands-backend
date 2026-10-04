// Noita's _stats.salakieli: AES-128-CTR encrypted XML of <E key="..." value="..."/> elements.
// The mod wants it as a Lua table so it can mark enemies as already-killed.
//
// Output format matches what the previous server produced (see test/fixtures/stats*.lua):
//   stats = {["key"]=value,\n["key"]=value}

import { XMLParser } from 'fast-xml-parser';

const KEY = Buffer.from('536563726574734f66546865416c6c53', 'hex');
const IV = Buffer.from('54687265654579657341726557617463', 'hex');

const cryptoKey = crypto.subtle.importKey('raw', KEY, 'AES-CTR', false, ['decrypt']);

export async function decryptStats(encrypted: Uint8Array): Promise<string> {
    const key = await cryptoKey;
    // Copy into a fresh ArrayBuffer: Buffers from fs may be views over a shared pool, which WebCrypto rejects.
    const bytes = new Uint8Array(encrypted);
    const plain = await crypto.subtle.decrypt(
        { name: 'AES-CTR', counter: IV, length: 128 },
        key,
        bytes,
    );
    return Buffer.from(plain).toString('utf8');
}

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
});

type Entry = { key: string; value: string };

/** Collect every <E key value> element in document order, wherever it sits in the tree. */
function collectEntries(node: unknown, out: Entry[]): void {
    if (Array.isArray(node)) {
        for (const child of node) collectEntries(child, out);
        return;
    }
    if (typeof node !== 'object' || node === null) return;
    for (const [name, child] of Object.entries(node as Record<string, unknown>)) {
        if (name === 'E') {
            for (const e of Array.isArray(child) ? child : [child]) {
                if (typeof e === 'object' && e !== null) {
                    const { key, value } = e as Record<string, unknown>;
                    if (typeof key === 'string' && typeof value === 'string')
                        out.push({ key, value });
                }
            }
        } else {
            collectEntries(child, out);
        }
    }
}

export function statsXmlToLua(xml: string): string {
    const entries: Entry[] = [];
    collectEntries(parser.parse(xml), entries);
    const luaKey = (k: string) => `["${k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    return `stats = {${entries.map((e) => `${luaKey(e.key)}=${e.value}`).join(',\n')}}`;
}

export async function convertNoitaStats(encrypted: Uint8Array): Promise<string> {
    return statsXmlToLua(await decryptStats(encrypted));
}
