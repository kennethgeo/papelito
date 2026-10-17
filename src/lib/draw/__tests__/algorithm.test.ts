import { computeSecretSantaDraw } from '../algorithm';

/**
 * Lightweight assertion helper for unit tests
 */
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FALLO DE PRUEBA: ${message}`);
  }
}

export function runDrawAlgorithmTests() {
  console.log('--- Iniciando pruebas del algoritmo de sorteo Papelito ---');

  // Test 1: Menos de 3 participantes debe fallar
  {
    const res = computeSecretSantaDraw(['u1', 'u2']);
    assert(!res.success, 'Debe rechazar menos de 3 participantes');
    console.log('✓ Prueba 1 superada: rechazo de < 3 participantes');
  }

  // Test 2: Participantes duplicados
  {
    const res = computeSecretSantaDraw(['u1', 'u2', 'u1']);
    assert(!res.success, 'Debe rechazar IDs duplicados');
    console.log('✓ Prueba 2 superada: rechazo de duplicados');
  }

  // Test 3: Sorteo normal con 3 participantes
  {
    const participants = ['p1', 'p2', 'p3'];
    const res = computeSecretSantaDraw(participants);
    assert(res.success, 'Debe resolver sorteo de 3 participantes');
    if (res.success) {
      assert(res.pairs.length === 3, 'Debe haber exactamente 3 pares');
      // Invariant: no self assignment
      res.pairs.forEach((pair) => {
        assert(pair.giverId !== pair.receiverId, 'Nadie se regala a sí mismo');
      });
      // Invariant: bijection
      const givers = new Set(res.pairs.map((p) => p.giverId));
      const receivers = new Set(res.pairs.map((p) => p.receiverId));
      assert(givers.size === 3, 'Todos regalan exactamente una vez');
      assert(receivers.size === 3, 'Todos reciben exactamente una vez');
    }
    console.log('✓ Prueba 3 superada: sorteo básico de 3 personas e invariantes');
  }

  // Test 4: Sorteo de 8 participantes con exclusiones dirigidas
  {
    const participants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    const exclusions = [
      { giverId: 'p1', excludedReceiverId: 'p2' },
      { giverId: 'p2', excludedReceiverId: 'p1' },
      { giverId: 'p3', excludedReceiverId: 'p4' },
    ];
    const res = computeSecretSantaDraw(participants, exclusions);
    assert(res.success, 'Debe resolver sorteo con exclusiones válidas');
    if (res.success) {
      res.pairs.forEach((pair) => {
        assert(pair.giverId !== pair.receiverId, 'Sin autoasignación');
        if (pair.giverId === 'p1') {
          assert(pair.receiverId !== 'p2', 'Exclusión p1 -> p2 respetada');
        }
        if (pair.giverId === 'p2') {
          assert(pair.receiverId !== 'p1', 'Exclusión p2 -> p1 respetada');
        }
        if (pair.giverId === 'p3') {
          assert(pair.receiverId !== 'p4', 'Exclusión p3 -> p4 respetada');
        }
      });
    }
    console.log('✓ Prueba 4 superada: exclusiones dirigidas respetadas');
  }

  // Test 5: Caso imposible detectado correctamente
  {
    const participants = ['p1', 'p2', 'p3'];
    // p1 excludes everyone else
    const impossibleExclusions = [
      { giverId: 'p1', excludedReceiverId: 'p2' },
      { giverId: 'p1', excludedReceiverId: 'p3' },
    ];
    const res = computeSecretSantaDraw(participants, impossibleExclusions);
    assert(!res.success, 'Debe detectar caso matemáticamente imposible');
    console.log('✓ Prueba 5 superada: detección de caso imposible');
  }

  console.log('--- Todas las pruebas del algoritmo pasaron exitosamente ---\n');
}

// Allow direct execution via node
if (typeof require !== 'undefined' && require.main === module) {
  runDrawAlgorithmTests();
}
