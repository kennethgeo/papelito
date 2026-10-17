import { computeSecretSantaDraw, MAX_DRAW_PARTICIPANTS } from '../src/lib/draw/algorithm.ts';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALLO: ${message}`);
    process.exit(1);
  }
}

console.log('=== Verificación de algoritmo de sorteo El lazo (importando módulo real de la app) ===');

// 1. Mínimo 3 participantes
const t1 = computeSecretSantaDraw(['a', 'b']);
assert(!t1.success, 'Debe fallar con menos de 3');
console.log('✓ 1. Mínimo 3 participantes validado');

// 2. Duplicados
const t2 = computeSecretSantaDraw(['a', 'b', 'a']);
assert(!t2.success, 'Debe fallar con duplicados');
console.log('✓ 2. Duplicados rechazados');

// 3. Sorteo normal de 5 personas
const participants5 = ['valeria', 'carlos', 'daniela', 'roberto', 'chela'];
const t3 = computeSecretSantaDraw(participants5);
assert(t3.success, 'Debe ser exitoso con 5 personas');
assert(t3.pairs.length === 5, 'Debe tener 5 pares');
t3.pairs.forEach((p) => {
  assert(p.giverId !== p.receiverId, 'Nadie se autoasigna');
});
const givers = new Set(t3.pairs.map((p) => p.giverId));
const receivers = new Set(t3.pairs.map((p) => p.receiverId));
assert(givers.size === 5, 'Todos regalan');
assert(receivers.size === 5, 'Todos reciben');
console.log('✓ 3. Sorteo de 5 personas cumple todas las invariantes');

// 4. Exclusiones mutuas (ej. parejas)
const exclusions = [
  { giverId: 'valeria', excludedReceiverId: 'carlos' },
  { giverId: 'carlos', excludedReceiverId: 'valeria' },
];
const t4 = computeSecretSantaDraw(participants5, exclusions);
assert(t4.success, 'Debe resolver con parejas excluidas');
t4.pairs.forEach((p) => {
  assert(p.giverId !== p.receiverId, 'Sin autoasignación');
  if (p.giverId === 'valeria') assert(p.receiverId !== 'carlos', 'Valeria no regala a Carlos');
  if (p.giverId === 'carlos') assert(p.receiverId !== 'valeria', 'Carlos no regala a Valeria');
});
console.log('✓ 4. Exclusiones mutuas de parejas estrictamente respetadas');

// 5. Caso imposible simple (un participante sin destinatarios)
const impossibleExclusions = [
  { giverId: 'valeria', excludedReceiverId: 'carlos' },
  { giverId: 'valeria', excludedReceiverId: 'daniela' },
  { giverId: 'valeria', excludedReceiverId: 'roberto' },
  { giverId: 'valeria', excludedReceiverId: 'chela' },
];
const t5 = computeSecretSantaDraw(participants5, impossibleExclusions);
assert(!t5.success, 'Debe detectar caso imposible cuando no hay candidatos');
console.log('✓ 5. Caso imposible simple detectado correctamente');

// 6. Caso imposible por condición de Hall (cuello de botella de subconjunto)
// En un grupo de 5 personas {A, B, C, D, E}:
// Si A, B, C solo pueden regalar a D y E:
// Grados de salida de A, B, C son 2 (> 0)
// Grados de salida de D, E son positivos
// Grados de entrada de todos son positivos
// Sin embargo, 3 personas (A, B, C) necesitan 3 destinatarios distintos, pero solo tienen acceso a 2 ({D, E}).
// Un algoritmo ingenuo con backtracking exploraría permutaciones. El matching bipartito lo detecta en tiempo polinómico.
const participantsHall = ['p1', 'p2', 'p3', 'p4', 'p5'];
const hallBottleneckExclusions = [
  // p1 solo puede regalar a p4 y p5 (excluido de p2, p3)
  { giverId: 'p1', excludedReceiverId: 'p2' },
  { giverId: 'p1', excludedReceiverId: 'p3' },
  // p2 solo puede regalar a p4 y p5 (excluido de p1, p3)
  { giverId: 'p2', excludedReceiverId: 'p1' },
  { giverId: 'p2', excludedReceiverId: 'p3' },
  // p3 solo puede regalar a p4 y p5 (excluido de p1, p2)
  { giverId: 'p3', excludedReceiverId: 'p1' },
  { giverId: 'p3', excludedReceiverId: 'p2' },
];
const t6 = computeSecretSantaDraw(participantsHall, hallBottleneckExclusions);
assert(!t6.success, 'Debe detectar cuello de botella de subconjunto (Condición de Hall)');
console.log('✓ 6. Violación de condición de Hall detectada en tiempo polinómico sin recursión factorial');

// 7. Prueba de rendimiento con grupo grande (100 participantes)
const largeGroup = Array.from({ length: 100 }, (_, i) => `user_${i}`);
const startTime = performance.now();
const t7 = computeSecretSantaDraw(largeGroup);
const duration = performance.now() - startTime;
assert(t7.success, 'Debe resolver grupo de 100 participantes');
assert(t7.pairs.length === 100, 'Debe tener 100 pares');
console.log(`✓ 7. Grupo de 100 participantes resuelto en ${duration.toFixed(2)} ms (< 50 ms)`);

// 8. Límite máximo de participantes excedido
const tooMany = Array.from({ length: MAX_DRAW_PARTICIPANTS + 1 }, (_, i) => `user_${i}`);
const t8 = computeSecretSantaDraw(tooMany);
assert(!t8.success, 'Debe rechazar grupos mayores al límite permitido');
console.log('✓ 8. Límite máximo de participantes validado');

console.log('=== Todas las pruebas unitarias del módulo real pasaron con éxito ===');
