# Nivel de prueba de maRio de Ayer

Desde la carpeta exterior `RioDeAyer`:

```powershell
npm.cmd --prefix ./RioDeAyer run game
```

Flechas izquierda/derecha o A/D para caminar; Shift para correr; Espacio,
arriba o W para saltar; abajo o S para agacharse (o deslizarse con velocidad).
El salto requiere una pulsación nueva y estar apoyado.

Resolución lógica: 1280 × 720. El nivel mide 4480 px (3,5 pantallas).
La cámara original se conserva. El HUD muestra las vidas restantes con el
mismo estilo; se conservan las animaciones de `mario-sprites-grid.png`.

Recorrido: suelo libre hasta x=960, dos bloques bajos, tronco sólido,
río de 112 px, tres bloques bajos y río de 152 px. Hay suelo despejado
antes y después de los cruces y un tramo final libre. Todo se puede superar
caminando y saltando: correr y deslizarse son opcionales. Las caídas y los
impactos con enemigos descuentan una vida y reinician el nivel completo.
El primer tocón corto permite visitar una habitación secreta (ver abajo).
Los troncos horizontales y los demás tocones siguen siendo plataformas normales.

## Tocones y árboles secos del nivel 1-1

Se sumaron tres tocones cortados de 36, 52 y 68 px de alto, cerca de x=1828,
3792 y 6576, y dos árboles secos quebrados de 112 y 116 px en x=3348 y 4392.
Se distribuyen a lo largo del recorrido completo de 6720 px.
La apertura sigue despejada y se dejan al menos 100 px libres junto a los ríos.

`WOODLAND_OBSTACLES` en `src/main.js` define los perfiles escalonados: copa
plana, hombros y raíces. Cada tramo genera un cuerpo estático en
`LEVEL_SURFACES`; `src/landscape.js` pinta todos los troncos con una única
paleta de marrones cálidos (`LOG_WOOD`), corteza oscura, vetas y anillos
dentro de esos mismos rectángulos, a la escala pixel art
del paisaje. Las alturas permiten subir con el salto normal y caminar o
quedarse parado arriba. No se modifican la física, los controles, la cámara
ni los sprites existentes; no hay escalada, agarres ni plataformas móviles.
Sólo el primer tocón corto tiene una entrada secreta.

Los troncos horizontales conservan su paleta marrón, vetas y anillos originales.
Sus extremos tienen pequeñas muescas y astillas de corteza dibujadas dentro de
las dimensiones existentes; la línea superior transitable permanece completa.
Los tocones y árboles secos altos comparten esos marrones y colores de madera
cortada. `deadwood` dibuja las cinco piezas verticales y todas usan `hollowCut`
para su abertura superior: cavidad asimétrica casi negra, pared interior marrón
y borde grueso de madera clara. `woodCut` sólo prepara la madera del borde,
sin dejar una variante vertical maciza. `makeLandscape`, en la rama
`kind === 'log'`, dibuja los tres troncos horizontales, incluidos los originales.
No queda una paleta gris alternativa para ninguna de estas variantes.
La lámina [preview-troncos-1-1.png](preview-troncos-1-1.png) muestra las ocho
piezas identificadas por tipo y coordenada, capturadas dentro del juego.
Los tres tocones de x=1828, 3792 y 6576 y los dos troncos altos de x=3348 y
4392 son huecos visualmente, sin excepciones por posición. Las pequeñas muescas
de corteza y diferencias de altura recortan sólo un píxel del contorno dibujado;
la línea central de apoyo permanece visible. Se conserva toda la geometría
física y la paleta exacta anterior. La comparación del arte está en
[preview-tocones-verticales.png](preview-tocones-verticales.png).
Este ajuste es únicamente gráfico: no cambia posiciones ni colisiones.

## Primera habitación secreta

La entrada es el **primer tocón corto**, que ocupa x=1828–1920 (copa en
y=604), después del tronco horizontal de x=1656 y antes del primer río.
Saltar encima, quedarse centrado sobre la abertura oscura (maRio en x≈1873)
y pulsar **↓ o S**. La entrada requiere una pulsación nueva y apoyo sobre
esa copa; mantener abajo desde antes de aterrizar no activa el secreto.

El descenso dura 1,3 segundos. Se usa la pose idle original, desplazada
gradualmente y recortada detrás del borde delantero de madera, sin alterar
la textura del tocón, el sprite ni la hitbox. Durante la entrada se bloquean
el movimiento y las interacciones físicas. Al desaparecer, un fundido de
180 ms abre una habitación cerrada de tierra compactada, piedras y raíces.

Hay **exactamente 15 monedas** y ningún enemigo, bloque ni otro premio.
Caminar y saltar normalmente permite recogerlas todas. El contador y las
vidas usan el mismo estado del HUD: cada 100 monedas sigue otorgando una vida.
Las cuatro paredes físicas contienen al personaje. F2 permite inspeccionarlas.

La **enredadera verde de la pared derecha** es la salida: acercarse y pulsar
**↑ o W**. No hace falta escalar ni estar en una altura particular. Espacio
sigue saltando. El tallo sinuoso, las hojas puntiagudas de tamaños y posiciones
variados y las ramificaciones y raíces se dibujan en píxeles enteros de colores
sólidos, sin cambiar las paredes ni la ubicación de la salida.
Al activarla, maRio se alinea con la planta y trepa un tramo de 32 px durante
650 ms, alternando las poses existentes `walk-1` y `walk-2`. Durante la trepada
y el fundido se bloquean los controles y el cuerpo físico. La salida sólo se
activa una vez. Tras el fundido habitual de 180 ms, vuelve sobre la misma copa, con
los pies en y=604 y velocidad cero. Probar de nuevo ↓/S sólo lo agacha: la
entrada queda utilizada durante el resto de ese intento del nivel, aunque
queden monedas sin recoger dentro. Reiniciar por completo el nivel (incluida
la reconstrucción tras perder una vida) o empezar una partida nueva restablece
la entrada y sus monedas, siguiendo el reinicio completo ya existente.

`src/secret-room.js` contiene la entrada de un uso, el registro de recogidas,
la geometría y el arte del subsuelo. `Underground` en `src/main.js` reutiliza
los controles, la física, las hitboxes, las animaciones y el HUD existentes.
La escena `Playground` queda pausada durante la visita y se reanuda sin
reconstruirla: se conservan sus monedas retiradas, bloques usados o rotos,
enemigos derrotados, temporizadores, vidas y poder activo. `CoinSystem`
acepta una distribución y un registro de monedas opcionales para reutilizar
las mismas reglas de recogida en ambas escenas.

Prueba manual: recoger una moneda y activar un bloque antes de entrar;
visitar el subsuelo, recoger sus monedas y salir por la enredadera; verificar
que el contador sumó las recogidas, que el bloque sigue usado y la moneda
exterior no reaparece. Volver a pulsar ↓/S sobre la abertura y comprobar que
no hay otra visita. Los otros cuatro árboles huecos no aceptan entrada.

`tests/secret-room.test.mjs` cubre entrada con ↓/S, descenso progresivo,
salida con ↑/W, conservación de objetos y progreso, bloqueo de reentrada,
recogidas únicas, vidas por 100 monedas, saltos alcanzables y límites sólidos
con Arcade a 30, 60 y 120 FPS. Incluye la duración, el ascenso corto y las poses
de trepada, la transición única y la conservación de monedas, vidas y saldo de
ladrillos secretos al regresar. El reinicio completo también se comprueba en
`tests/death.test.mjs`.

Capturas verificadas dentro del juego:
[descenso por el tocón](preview-secret-entry.png) y
[habitación con las 15 monedas](preview-secret-room.png).

Para revisar el apoyo y los bordes, usar **F2** o `?debugPhysics=1` y recorrer
los cinco sectores. Las pruebas de movimiento verifican saltos desde ambos
lados, apoyo quieto, caminata y salida por los bordes a 30, 60 y 120 FPS.
`tests/woodland.test.mjs` comprueba además la coincidencia entre píxeles y
colisiones, la distribución, las distancias a ríos y el espacio bajo bloques.

`LEVEL_SURFACES` define tanto el terreno dibujado como las colisiones estáticas.
Los gráficos provisionales se dibujan con Canvas: barranca, pasto, tronco y agua;
el cielo queda fijo y las dos capas de islas usan parallax. No se usan imágenes
externas para el fondo. El contador de vidas del HUD es funcional.

Desde la carpeta interior:

```powershell
npm.cmd run game:build
node --test game/tests/*.test.mjs
```

La compilación queda en `game/dist`. Los archivos y comandos de HyperFrames
pertenecen a la composición original, separada del juego Phaser.

## Escala visual

La camara del mundo usa zoom 1,6x: maRio, terreno y obstaculos se ven un 60 %
mas grandes, sin escalar cuerpos fisicos ni alterar distancias del nivel.
El salto desde el bloque mas alto cabe completo debajo del HUD. Se conserva
el suavizado horizontal (0,1), la zona central de 320 pixeles en pantalla y
la ausencia de seguimiento vertical. El suelo sigue a 640 px de la pantalla.
El encuadre muestra 800 unidades de mundo a la vez; el recorrido mantiene
sus 4480 unidades originales.

`src/landscape.js` genera el paisaje pixel-art con Canvas: cielo de atardecer,
Parana texturado, reflejo del sol, islas con copas irregulares, sauces y juncos.
El primer plano tiene pasto, raices, tierra y corteza. Dos camaras de dibujo
separan fondo/HUD del acercamiento del mundo; el parallax conserva sus factores.

## Primer enemigo

Hay seis hongos en x=720, 1140, 1490, 2650, 2940 y 3010; los dos últimos
comparten un tramo plano posterior. Su lógica está
en src/enemies.js: velocidad 55, animación de dos poses a 5 fps, gravedad y
colisión con el terreno. Pisarlo desde arriba produce un rebote de -360 y
muestra la pose aplastada durante 450 ms antes de retirarlo. Los contactos
laterales o desde abajo emiten enemy-impact y quedan en enemies.lastImpact.
La escena activa el estado dead: bloquea controles y colisiones del jugador,
aplica un impulso vertical de -420 y conserva la gravedad para que caiga.
A los 1300 ms reinicia el nivel completo si quedan vidas; con cero muestra GAME OVER.
El pisotón comprueba velocidad descendente, cruce de los pies sobre la parte
superior de la hitbox y solapamiento horizontal en ese instante.

El PNG mide 2172 × 724. Los recortes explícitos (x, y, ancho, alto) son
(0, 9, 678, 659), (701, 38, 697, 662) y (1407, 254, 710, 454).
Se normalizan en cuadros de 44 × 40 con los pies alineados.

Verificación: node --test game/tests/*.test.mjs

## Bloque de pregunta y hongo blanco

`src/powerups.js` contiene la lógica independiente de un bloque de unos 33 × 32
en x=560, con su cara superior en y=488. Es sólido para maRio y el hongo.
Un golpe ascendente desde abajo lo activa una sola vez; sus poses 1–3
acompañan un pequeño movimiento visual de 300 ms y la pose 4 queda usada.
La hitbox sólida permanece fija durante ese movimiento.

El hongo blanco usa frames ajustados al dibujo (hasta 26 × 25), menor que el enemigo (44 × 40).
Sale por detrás del bloque durante 1100 ms con su cuerpo físico desactivado.
Al terminar activa gravedad y avanza a 90 px/s, colisiona con terreno y bloque,
rebota lateralmente y puede caer de plataformas. Sólo entonces se puede recoger:
desaparece y emite `powerup-collected`, sin modificar las habilidades de maRio.
La muerte del jugador impide activaciones y recogidas; reiniciar repone el bloque.
Para inspeccionar colisiones, F2 alterna las hitboxes de Arcade; también se puede
iniciar con `?debugPhysics=1`. El modo está desactivado por defecto.
Las medidas, correcciones y pasos de prueba están en
[VERIFICACION-COLISIONES.md](VERIFICACION-COLISIONES.md).
Hay tres bloques adicionales en x=1490, 2340 y 3930, todos con su cara
superior en y=488. Los de x=1490 y x=3930 entregan una moneda; el de x=2340
sigue vacío. Se animan una sola vez y quedan usados.

Los PNG miden 2141 × 734 (bloque) y 1536 × 1024 (hongo). Los cinco recortes
de cada uno están definidos explícitamente en `BLOCK_REGIONS` y
`MUSHROOM_REGIONS`; excluyen partículas separadas y sombras del suelo.
Los frames no incluyen relleno del canvas; el bloque y el hongo se alinean por
su borde inferior visible, con cuerpos físicos ajustados al dibujo. Durante
la salida se recorta la parte del hongo que aún queda debajo del borde del bloque.

## Partida y vidas

La carrera máxima es 400 px/s (antes 460); la caminata sigue a 280 px/s con
el mismo arranque gradual para pulsaciones cortas, y la aceleración de carrera
sigue en 900 px/s². Se conservan salto, frenado, agacharse y deslizamiento.

Cada partida comienza con tres vidas. `die()` bloquea controles y descuenta
exactamente una vida, tanto por impacto con un enemigo como por caer al río.
El impacto produce el impulso de muerte; las caídas continúan hacia abajo.
Tras 1300 ms se reinicia la escena conservando vidas restantes y monedas acumuladas:
maRio, enemigos, bloques, hongo y monedas flotantes vuelven a su estado inicial.
Al llegar a cero, GAME OVER permite comenzar con tres vidas usando una nueva
pulsación de Enter o Espacio. El reinicio limpia los eventos y tolera grupos
que Phaser ya haya destruido durante el cierre de la escena.

## Monedas

`src/coins.js` usa seis recortes medidos de la fila superior de
`moneda-1-peso.png` (1536 × 1024), sin asumir una grilla regular. Las poses
conservan una escala común en frames de 24 × 24; se combinan con sus reflejos
para animar la rotación. La fila inferior con destellos no se usa.

Hay **15 monedas visibles en el escenario principal** distribuidas entre el
camino, las plataformas y los cuatro cruces de río, más las **15 de la habitación
secreta**: exactamente 30 colocadas inicialmente. Tocarlas las retira inmediatamente
y suma una unidad. Las monedas de los bloques `?` se conservan como premios
adicionales, con su animación breve hacia arriba; los bloques con hongo mantienen
su recompensa original.

Dos ladrillos de barro existentes contienen monedas ocultas: uno entrega 4 y
el otro 5. Usan la misma textura, tamaño y cuerpo estático que los ladrillos
normales. Cada golpe ascendente válido desde abajo entrega una sola moneda,
incluso sin el poder de fuerza, y reutiliza la animación de recompensa de los
bloques `?`. El premio hereda el filtro de cámaras del ladrillo y no tiene
cuerpo de recogida que permita contarlo otra vez. Los callbacks de un mismo
paso físico no pueden duplicar el premio ni romper el ladrillo al dar su última
moneda. Agotado el saldo, un golpe posterior sólo lo rompe si maRio tiene fuerza,
con los mismos fragmentos y colisiones de siempre. Estos 9 premios ocultos y los
premios de los bloques `?` no forman parte de las 30 monedas visibles.

`tests/bricks.test.mjs` comprueba golpes únicos, límites de ambos ladrillos,
agotamiento y rotura posterior, contactos inválidos, contador y vida extra,
animación de premios y colisiones junto a bloques vecinos a 30, 60 y 120 FPS.
`tests/level.test.mjs` verifica el reparto de las 30 monedas visibles.

El HUD muestra x00–x99. Cada 100 monedas el contador vuelve a x00 y se otorga
una vida, también en vueltas posteriores. Morir conserva el saldo y las vidas
restantes, y restaura las monedas y los bloques del intento. Una nueva partida
después de GAME OVER comienza con tres vidas y cero monedas. Los estados de
recogida y activación impiden contabilizar dos veces un mismo objeto.
