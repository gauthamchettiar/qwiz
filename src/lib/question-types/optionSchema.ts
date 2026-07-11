/** JSON Schema fragments shared by the `single` and `multiple` question types — both describe
 * the same content blocks, answer options, and prompt extras, so they live here rather than
 * being duplicated in each type's index.ts. */

export const contentBlockSchema = {
  oneOf: [
    {
      type: 'object',
      required: ['kind', 'text'],
      properties: { kind: { const: 'text' }, text: { type: 'string' } },
      additionalProperties: false
    },
    {
      type: 'object',
      required: ['kind', 'url', 'alt'],
      properties: { kind: { const: 'image' }, url: { type: 'string' }, alt: { type: 'string' } },
      additionalProperties: false
    },
    {
      type: 'object',
      required: ['kind', 'videoId'],
      properties: { kind: { const: 'video' }, videoId: { type: 'string' } },
      additionalProperties: false
    }
  ]
};

export const nullableContentBlockSchema = { oneOf: [contentBlockSchema, { type: 'null' }] };

export const answerOptionSchema = {
  type: 'object',
  required: ['id', 'kind', 'content', 'points'],
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { enum: ['text', 'image', 'video'] },
    content: contentBlockSchema,
    points: { type: 'number' }
  },
  additionalProperties: false
};

export const promptExtraSchema = {
  type: 'object',
  required: ['id', 'kind', 'content', 'label', 'revealContent', 'points'],
  properties: {
    id: { type: 'string', minLength: 1 },
    kind: { enum: ['text', 'image', 'video', 'reveal'] },
    content: nullableContentBlockSchema,
    label: { type: ['string', 'null'] },
    revealContent: nullableContentBlockSchema,
    points: { type: ['number', 'null'] }
  },
  additionalProperties: false
};
