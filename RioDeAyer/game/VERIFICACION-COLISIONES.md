# WORLD 1-1: diagnóstico y verificación de colisiones

## Causas y correcciones

### Cuerpos y escala visual

Se midieron los PNG originales y su transformación de dibujo, sin cambiar
sprites, escalas, animaciones ni cámara. Estas son las dimensiones físicas
actuales en unidades de mundo:

| Personaje / estado | Cuerpo | Offset en el frame | Escala del sprite |
| --- | --- | --- | --- |
| maRio parado / salto | 30 × 53,90 | 3; 10,10 | 1, sobre el frame normalizado de 36 × 64 |
| maRio agachado / deslizando | 30 × 32 | 3; 32 | La misma |
| Hongo caminante | 33 × 35 | 5,5; 5 | 1, sobre el frame normalizado de 44 × 40 |
| Tortuga caminante | 47,36 × 30,72 | 7,04; 12,80 | 0,32 |
| Tortuga / caparazón | 34,56 × 26,88 | 13,44; 16,64 | 0,32 |

El cuerpo anterior de maRio medía 32 de ancho, frente a unos 30 de dibujo
parado. El hongo incluía márgenes semitransparentes: su cuerpo empezaba en
x=4, y=2, pero la primera pose opaca empieza aproximadamente en x=5,6, y=4,9.
Se ajustaron únicamente esos márgenes. El cuerpo del hongo queda centrado para
conservar el ajuste al invertir el sprite; también conserva su línea de apoyo.
Las tortugas ya tenían cuerpos dentro de las siluetas visibles; se conservaron
sus dimensiones y offsets originales (148 × 96 / 108 × 84 en píxeles fuente).

El cuerpo de salto sigue excluyendo los 10,10 píxeles transparentes sobre la
cabeza. Al agacharse, el cambio de altura conserva los pies y el historial de
Arcade para que `postUpdate` no desplace el sprite por el cambio de tamaño.
Bajo un techo, maRio conserva el cuerpo y la pose cortos hasta tener espacio.
La altura agachada de 32 se mantiene para los pasos de un bloque.

### Enemigos y orden de resolución

El contacto con enemigos se registraba antes que las colisiones con ladrillos
y bloques `?`. Un cuerpo que acababa de avanzar podía solaparse con un enemigo
antes de que una pared corrigiera esa posición. Ahora todos los sólidos del
jugador se resuelven antes de comprobar ese contacto.

Además, los cambios de estado de las tortugas recalculaban el cuerpo desde el
sprite, todavía pendiente de recibir el movimiento físico del frame. Eso
perdía desplazamiento y contaba el nuevo offset como movimiento de los pies.
Ahora se conserva la posición física actual y se desplaza su historial al
cambiar de altura; los pies no saltan al esconderse, salir o cambiar de dirección.

Se conserva el primer rebote de -360, el impulso horizontal del caparazón de
330 px/s, la protección contra contactos continuos y sus colisiones existentes.
Los contactos laterales e inferiores peligrosos siguen causando daño; los
pisotones válidos desde arriba conservan su comportamiento.

### Golpes en ladrillos

Se reprodujo una dependencia del orden: el mismo golpe sobre la unión entre
un `?` y un ladrillo rompía el ladrillo si se procesaba primero, pero fallaba
si el `?` resolvía antes la colisión y ponía la velocidad vertical en cero.
También podía ocurrir entre ladrillos y bloques usados de la misma fila.

Ahora el callback previo de cualquier bloque alcanzado registra los ladrillos
cuyas caras inferiores cruza la cabeza durante ese ascenso. Después de la
separación se rompen los ladrillos registrados de la fila realmente alcanzada.
El cuerpo sólido permanece activo hasta que Arcade detiene el ascenso y corrige
la penetración. Se desactiva inmediatamente después; la destrucción del objeto
se difiere para no alterar el grupo durante la iteración de colisiones.

Un ladrillo produce una sola tanda de fragmentos. Los golpes laterales,
las caídas sobre su cara superior, los bloques usados y los jugadores sin
potenciar mantienen sus reglas. Un bloque de una fila superior no se rompe
si otro inferior detuvo primero el ascenso.

### Geometría del nivel

El relevamiento encontró una abertura menor que un bloque en la escalera:
el bloque usado de x=4257 dejaba 24 píxeles hasta el suelo. Los siguientes
escalones, x=4290 y x=4323, dejaban 56: apenas 2,1 más que el cuerpo parado.

Se elevó únicamente esa estructura 8 píxeles: el bloque usado pasa de y=584 a
y=576; los cuatro ladrillos pasan de y=552/520/488 a y=544/512/480. El primer
paso deja 32 píxeles libres y los siguientes dejan 64. Se mantienen las columnas,
los peldaños y el resto de las posiciones. Las otras filas suspendidas y sus
plataformas ya dejan espacio suficiente; el terreno comparte la misma geometría
para el dibujo y los cuerpos sólidos.

No se cambiaron velocidad, aceleración, frenado, gravedad, impulsos de salto,
controles de movimiento, cámara, texturas ni diseño general del nivel.

## Visualización opcional de hitboxes

Desde la carpeta interior `RioDeAyer`:

```powershell
npm.cmd run game
```

- Pulsar **F2** para mostrar u ocultar los cuerpos durante la partida.
- Para iniciar con ellos visibles, agregar **`?debugPhysics=1`** a la dirección
  del juego, por ejemplo `http://127.0.0.1:5173/?debugPhysics=1`.
- Quitar ese parámetro y recargar para volver al inicio normal. Por defecto
  está desactivado; F2 modifica la escena actual. El parámetro permite mantener
  la depuración al reiniciar por una muerte.

Los cuerpos dinámicos aparecen en magenta y los estáticos en azul. El gráfico
nativo de Arcade se dibuja sólo con la cámara del mundo; las cámaras de paisaje
y HUD lo ignoran para evitar copias con otro zoom o posición. No se dibujan
vectores de velocidad y mantener F2 pulsado no alterna repetidamente el modo.

## Pruebas y verificación manual

```powershell
node --test game/tests/*.test.mjs
npm.cmd run game:build
```

Las pruebas usan el `Body`, `StaticBody` y la separación del Phaser instalado.
Se comprueban:

- Golpes en el centro y con 0,1 píxel de solapamiento en ambos bordes, con los
  impulsos -650 y -760 a 30, 60 y 120 FPS.
- Uniones entre ladrillos, bloques usados y `?` en ambos órdenes de callbacks;
  también se ejecutan los callbacks del constructor real del sistema de `?`.
- Golpes laterales que entran después de cruzar la cara inferior, filas
  superiores, ausencia de doble destrucción y continuación de la gravedad.
- Siluetas medidas del canal alfa de los PNG, contactos con hongos, tortugas
  y caparazones, pisotones, daño lateral/inferior y enemigos detrás de un sólido.
- Línea de apoyo y movimiento pendiente al cambiar de estado de la tortuga.
- El túnel de un bloque y la escalera real del nivel a tres tasas de cuadros,
  conservación de los pies y espera bajo techo antes de levantarse.
- Modo de depuración desactivado por defecto, alternancia y filtros de cámaras.

Dentro del juego:

1. **Ladrillos:** recoger el hongo blanco del primer `?`, y saltar contra el
   ladrillo vecino de x=593 en el centro y cerca de ambos bordes. Repetir en
   la unión con el `?` y con el bloque usado contiguo. Los ladrillos deben
   romperse; el `?` y el bloque usado conservan sus propias reglas.
2. **Enemigos:** activar F2 y acercarse caminando a un hongo desde ambos lados.
   El daño debe coincidir razonablemente con el contacto visible. Saltar sobre
   un hongo y una tortuga; probar un nuevo contacto con el caparazón inmóvil y
   un pisotón sobre el caparazón en movimiento.
3. **Escalera:** avanzar al sector x≈4257, activar F2 y correr con Shift para
   iniciar el deslizamiento con abajo/S antes del bloque bajo. Debe atravesar
   los 32 píxeles libres y poder recuperar su altura en el tramo siguiente de
   64. Si el deslizamiento se detiene debajo del primer bloque, soltar abajo no
   debe levantar a maRio a través del techo.
4. **Depuración:** alternar F2 varias veces y comprobar que los rectángulos
   siguen a los sprites y superficies con el mismo zoom, sin duplicarse en el HUD.
