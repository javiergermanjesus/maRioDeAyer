# Nivel de prueba de maRio de Ayer

Desde la carpeta exterior `RioDeAyer`:

```powershell
npm.cmd --prefix ./RioDeAyer run game
```

Flechas izquierda/derecha o A/D para caminar; Shift para correr; Espacio,
arriba o W para saltar; abajo o S para agacharse (o deslizarse con velocidad).
El salto requiere una pulsación nueva y estar apoyado.

Resolución lógica: 1280 × 720. El nivel mide 4480 px (3,5 pantallas).
La cámara y el HUD originales se conservan, al igual que la física, los
controles y las animaciones de `mario-sprites-grid.png`.

Recorrido: suelo libre hasta x=960, dos bloques bajos, tronco sólido,
río de 112 px, tres bloques bajos y río de 152 px. Hay suelo despejado
antes y después de los cruces y un tramo final libre. Todo se puede superar
caminando y saltando: correr y deslizarse son opcionales. Caer al río devuelve
al inicio; no hay vidas, enemigos, secretos, power-ups ni transición final.
El tronco es únicamente un cuerpo sólido sin interacción.

`LEVEL_SURFACES` define tanto el terreno dibujado como las colisiones estáticas.
Los gráficos provisionales se dibujan con Canvas: barranca, pasto, tronco y agua;
el cielo queda fijo y las dos capas de islas usan parallax. No se usan imágenes
externas para el fondo. El HUD sigue siendo decorativo.

Desde la carpeta interior:

```powershell
npm.cmd run game:build
node --test game/tests/movement.test.mjs
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
