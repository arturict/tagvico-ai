"use strict";
// services/metadataDiff.ts
//
// Pure helper for computing a structured "what changed" view between two
// metadata snapshots. The result is what the new /api/history/:id/diff
// endpoint returns and what the history page renders in the "Changes"
// column. Designed to be safe to call on partial objects (Patches are
// inherently partial) and on tagged types like arrays or Paperless
// custom_fields, where order is not significant.
/**
 * Deep equality that survives JSON normalisation. Two values are equal when
 * they have the same primitive value, the same array of equal values, or the
 * same set of object keys with equal values.
 */
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (a == null || b == null)
        return a === b;
    if (typeof a !== typeof b)
        return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b))
            return false;
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i += 1) {
            if (!deepEqual(a[i], b[i]))
                return false;
        }
        return true;
    }
    if (typeof a === 'object') {
        const aObj = a;
        const bObj = b;
        const keysA = Object.keys(aObj);
        const keysB = Object.keys(bObj);
        if (keysA.length !== keysB.length)
            return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(bObj, key))
                return false;
            if (!deepEqual(aObj[key], bObj[key]))
                return false;
        }
        return true;
    }
    return false;
}
/**
 * Build a stable fingerprint for a value. Arrays of primitives are sorted so
 * that tag-id reordering doesn't show up as a "change" in the diff.
 */
function fingerprint(value) {
    if (value == null)
        return JSON.stringify(value);
    if (Array.isArray(value)) {
        const isPrimitiveArray = value.every((item) => item === null ||
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean');
        if (isPrimitiveArray) {
            return JSON.stringify([...value].sort());
        }
        return JSON.stringify(value);
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return JSON.stringify(value);
}
/**
 * Compare two metadata snapshots and return the per-field changes.
 *
 * The output always has `applied: true` for fields present in `after` —
 * `applied` is reserved for the future case where the patch partially fails
 * and a per-field error is reported back. In that case the entry can be
 * returned with `applied: false` and an `error` string.
 */
function compareMetadata(before = {}, after = {}) {
    const fields = new Set([
        ...Object.keys(before || {}),
        ...Object.keys(after || {})
    ]);
    const changes = [];
    for (const field of fields) {
        const beforeValue = before ? before[field] : undefined;
        const afterValue = after ? after[field] : undefined;
        const inAfter = !!after && Object.prototype.hasOwnProperty.call(after, field);
        if (!inAfter) {
            // Field was removed in the after snapshot. Only emit a change if the
            // before value carried something meaningful (i.e. not undefined).
            if (beforeValue !== undefined) {
                changes.push({
                    field,
                    before: beforeValue,
                    after: undefined,
                    applied: true
                });
            }
            continue;
        }
        if (fingerprint(beforeValue) === fingerprint(afterValue))
            continue;
        changes.push({
            field,
            before: beforeValue,
            after: afterValue,
            applied: true
        });
    }
    // Stable order: sort by field name so the UI doesn't shuffle rows.
    changes.sort((a, b) => a.field.localeCompare(b.field));
    return changes;
}
module.exports = {
    compareMetadata,
    deepEqual,
    fingerprint
};
