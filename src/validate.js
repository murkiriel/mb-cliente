// Validações de opção compartilhadas (interno do SDK — fora do mapa
// de exports). Mensagem e campos field/received iguais em todo lugar, para
// quem trata o ValidationError não depender de qual módulo recusou.
import { ValidationError } from './errors.js'

export function checkPositiveInt(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${field} deve ser um inteiro maior ou igual a 1`, {
      field,
      received: value,
    })
  }
}

export function checkNonNegative(value, field) {
  if (!Number.isFinite(value) || value < 0) {
    throw new ValidationError(`${field} deve ser um número maior ou igual a 0`, {
      field,
      received: value,
    })
  }
}

export function checkBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${field} deve ser true ou false`, { field, received: value })
  }
}

export function checkTimeout(value, field = 'timeoutMs') {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} deve ser um número positivo de milissegundos`, {
      field,
      received: value,
    })
  }
}
