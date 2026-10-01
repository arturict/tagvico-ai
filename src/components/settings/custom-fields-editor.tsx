'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export type CustomFieldDefinition = {
  value: string;
  data_type: 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'monetary';
  currency?: string;
};

export function CustomFieldsEditor({
  fields,
  onChange
}: {
  fields: CustomFieldDefinition[];
  onChange: (fields: CustomFieldDefinition[]) => Promise<unknown> | void;
}) {
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<CustomFieldDefinition['data_type']>('string');
  const [currency, setCurrency] = useState('CHF');
  const [saving, setSaving] = useState(false);

  const update = async (nextFields: CustomFieldDefinition[]): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    try {
      return await onChange(nextFields) !== null;
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const value = name.trim();
    if (!value || fields.some((field) => field.value.toLowerCase() === value.toLowerCase())) return;
    const saved = await update([...fields, {
      value,
      data_type: dataType,
      ...(dataType === 'monetary' ? { currency: currency.trim().toUpperCase().slice(0, 3) || 'CHF' } : {})
    }]);
    if (saved) setName('');
  };

  return <div className="set-custom-fields">
    {fields.length ? <ul className="set-custom-field-list">{fields.map((field, index) => <li key={`${field.value}-${index}`}>
      <span><strong>{field.value}</strong><small>{field.data_type}{field.currency ? ` · ${field.currency}` : ''}</small></span>
      <button className="btn btn-ghost btn-icon btn-32" type="button" disabled={saving} aria-label={`Remove ${field.value}`} onClick={() => void update(fields.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button>
    </li>)}</ul> : <p className="set-field-help">No custom fields yet.</p>}
    <div className="set-inline-form">
      <input className="input" value={name} maxLength={200} placeholder="Field name" aria-label="Custom field name" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void add();
        }
      }} />
      <select className="select" value={dataType} aria-label="Custom field type" onChange={(event) => setDataType(event.target.value as CustomFieldDefinition['data_type'])}>
        <option value="string">Text</option>
        <option value="integer">Integer</option>
        <option value="float">Decimal</option>
        <option value="boolean">Yes / no</option>
        <option value="date">Date</option>
        <option value="monetary">Money</option>
      </select>
      {dataType === 'monetary' ? <input className="input set-currency" value={currency} maxLength={3} aria-label="Currency code" onChange={(event) => setCurrency(event.target.value)} /> : null}
      <button className="btn btn-secondary" type="button" disabled={saving || !name.trim()} onClick={() => void add()}><Plus /> Add field</button>
    </div>
  </div>;
}
