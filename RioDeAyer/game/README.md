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
No hay secretos ni transición final.
El tronco es únicamente un cuerpo sólido sin interacción.

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

Hay 22 monedas flotantes: sobre el camino, plataformas y en arcos que guían
los saltos de ambos ríos. Tocarlas las retira inmediatamente y suma una unidad.
Los dos bloques con moneda dan la recompensa automáticamente al activarse,
con una animación breve hacia arriba; el bloque del hongo blanco conserva el hongo.

El HUD muestra x00–x99. Cada 100 monedas el contador vuelve a x00 y se otorga
una vida, también en vueltas posteriores. Morir conserva el saldo y las vidas
restantes, y restaura las monedas y los bloques del intento. Una nueva partida
después de GAME OVER comienza con tres vidas y cero monedas. Los estados de
recogida y activación impiden contabilizar dos veces un mismo objeto.
