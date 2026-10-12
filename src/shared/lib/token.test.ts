import { describe, expect, it } from 'vitest';
import { esteTokenValid } from './token';

describe('tokenul din linkurile de email', () => {
  it.each([
    ['un UUID v4', '123e4567-e89b-42d3-a456-426614174000', true],
    ['același UUID cu majuscule', '123E4567-E89B-42D3-A456-426614174000', true],
    ['gol', '', false],
    ['un text oarecare', 'nu-e-uuid', false],
    ['un UUID cu un caracter în minus', '123e4567-e89b-42d3-a456-42661417400', false],
    ['un UUID cu spații în jur', ' 123e4567-e89b-42d3-a456-426614174000 ', false],
  ])('%s → %s', (_caz, token, asteptat) => {
    expect(esteTokenValid(token)).toBe(asteptat);
  });
});
