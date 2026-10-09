# Diagnóstico de fluidez — 9 de octubre de 2026

No se identificó una causa comprobable de la regresión. No se cambiaron la cámara,
el paso físico, el movimiento, las animaciones, las colisiones ni los gráficos.
Se conserva el indicador temporal de FPS.

## Mediciones en navegador

Chrome con WebGL, ejecución headless, un solo canvas y la página visible. Se
reinició el nivel y se desplazó al jugador a un tramo libre del segundo banco
para caminar alternando derecha e izquierda durante 15 segundos. Se conservaron
todos los enemigos, monedas y gráficos. Las teclas y la posición inicial se
controlaron solamente en la sesión de prueba, sin modificar el código del juego.
Las funciones instrumentadas se restauraron al terminar.

Dos ejecuciones válidas registraron 899 y 900 cuadros. En la última:

| Medición | Resultado |
| --- | --- |
| FPS de Phaser al terminar (`actualFps`) | 59,96 |
| Intervalo real entre renders: promedio / p95 / máximo | 16,68 / 18,20 / 20,70 ms |
| `Scene.update()`: promedio / p95 / máximo | 0,065 / 0,200 / 1,600 ms |
| Actualización de enemigos: promedio / p95 / máximo | 0,018 / 0,100 / 0,900 ms |
| Actualización de la animación de maRio: promedio / máximo | 0,004 / 0,200 ms |
| Todos los colliders y overlaps por cuadro: promedio / p95 / máximo | 0,128 / 0,400 / 2,100 ms |
| Actualización del texto FPS: 30 llamadas, promedio / máximo | 0,103 / 1,100 ms |
| Cuadros sin paso físico / con más de un paso | 0 / 9 |

Los intervalos se midieron con `performance.now()` en `postrender`, sin el
suavizado del contador FPS. Los costes se midieron envolviendo las funciones;
esa instrumentación añade trabajo y la resolución del reloj limita los tiempos
muy pequeños. El coste de colliders no incluye toda la integración física ni la
GPU. No hubo caída sostenida de FPS en estas ejecuciones. Tampoco demuestran la
ausencia de tirones en el navegador y monitor del usuario.

## Cámara y sincronización

- La cámara del mundo usa follow horizontal con lerp 0,1, deadzone y zoom 1,6.
  No se encontró redondeo manual de la posición del jugador o del scroll.
- En esta versión instalada de Phaser, `Camera.preRender()` activa
  `renderRoundPixels` solo con zoom entero. Durante la prueba fue `false` en la
  cámara del mundo, aunque `roundPixels` sea `true`. Cambiar ese flag no justificaría
  una corrección de su desplazamiento en WebGL.
- `syncLandscape` se ejecuta en `Scene.PRE_RENDER`, antes del `preRender()` de la
  cámara del mundo. Por eso el paisaje toma su `worldView.x` del cuadro anterior.
  Se verificó esa igualdad en las muestras. Excluyendo el arranque, el desfase
  absoluto tuvo p95 de 2,03 unidades y máximo de 2,25 en el recorrido de prueba.
- El follow, el zoom, el redondeo y la sincronización del paisaje son iguales en
  el commit anterior `6cab55b`. El desfase es real, pero no demuestra la causa
  de una pérdida de fluidez reciente; no se modificó de forma especulativa.

## Arcade Physics

La configuración instalada usa `fixedStep: true`, `fps: 60` y gravedad 1600.
Los cuerpos se transfieren a los sprites en el post-update físico, antes del
render. No hay interpolación adicional propia del juego.

Se contaron los eventos `worldstep` entre renders. En la última ejecución no
hubo cuadros sin paso; nueve necesitaron varios pasos para recuperar tiempo.
En pantallas de más de 60 Hz podrían aparecer renders sin avance físico, algo
que falta medir en el equipo afectado. Cambiar a paso variable o aumentar la
frecuencia física alteraría la simulación, por lo que no se aplicó.

## Trabajo repetido revisado

- Los enemigos asignan velocidad cada cuadro y los hongos repiten `setFlipX`.
  Las tortugas apoyadas consultan las superficies; hay arrays temporales y un
  `Set` nuevo de contactos por actualización.
- El overlap del grupo de enemigos contra sí mismo sigue activo sin caparazones
  en movimiento. Añade trabajo físico, pero los tiempos medidos no lo señalan
  como cuello de botella en esta escena.
- Las 22 monedas iniciales tienen cuerpos y animaciones de Phaser; no hay un
  `CoinSystem.update()` ni regeneración de texturas en cada cuadro. La animación
  se inicia al crearlas. Las texturas se construyen durante la creación del nivel.
- `player.play(..., true)` retorna sin reiniciar la animación si ya está activa.
  Las poses quietas repiten `stop()` y `setFrame()`. No se encontró creación de
  animaciones en el update ordinario.
- La geometría procedural se genera al crear/reiniciar el nivel, no al avanzar.
  Se renderizan las tres cámaras existentes y se sincroniza el paisaje por cuadro.

Ninguna de estas observaciones justificó optimizaciones ni cambios de comportamiento.

## Falta verificar

Capturar 15–30 segundos en Chrome/Edge Performance en el equipo afectado, durante
el recorrido donde ocurre el tirón, anotando frecuencia del monitor, FPS observado
y si se mueve a saltos el jugador, el suelo o solo el paisaje. Revisar intervalos
de presentación, pasos físicos, tareas largas, GC y tiempo de GPU en esos instantes.
Esta prueba headless a aproximadamente 60 Hz no reproduce la presentación en ese
monitor ni cubre el recorrido completo del nivel. Un FPS suavizado estable por sí
solo no descarta microtirones.
