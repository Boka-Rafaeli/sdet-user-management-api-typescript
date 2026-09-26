import type { Payload } from './fixtures.js';

export interface Mutation {
  id: string;
  apply(payload: Payload): void;
  postBug?: string;
  putBug?: string;
}

const missing = (field: string): Mutation => ({
  id: `missing-${field}`,
  apply: (payload) => {
    delete payload[field];
  },
});
const changed = (
  id: string,
  field: string,
  value: unknown,
  bugs: {
    postBug?: string;
    putBug?: string;
  } = {},
): Mutation => ({
  id,
  apply: (payload) => {
    payload[field] = value;
  },
  ...bugs,
});

export const mutations: readonly Mutation[] = [
  missing('name'),
  missing('email'),
  missing('age'),
  changed('null-name', 'name', null),
  changed('null-email', 'email', null),
  changed('null-age', 'age', null),
  changed('name-integer', 'name', 42, { postBug: 'BUG-006', putBug: 'BUG-006' }),
  changed('email-integer', 'email', 42, { postBug: 'BUG-006', putBug: 'BUG-006' }),
  changed('invalid-email', 'email', 'not-an-email', { postBug: 'BUG-005' }),
  changed('age-below-minimum', 'age', 0),
  changed('age-above-maximum', 'age', 151),
  changed('age-string', 'age', '42'),
  changed('age-boolean', 'age', true),
  changed('age-float', 'age', 42.5),
  changed('age-object', 'age', { value: 42 }),
];
