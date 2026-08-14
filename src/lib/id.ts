/** Identificadores curtos, ordenáveis por criação. */
export function newId(): string {
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `${time}-${rand}`
}
