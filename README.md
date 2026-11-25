# GridUP BasicCAD

**CAD paramétrico básico que funciona 100 % en el navegador.** Diseña rejas, piezas de revolución y extrusiones, míralas en 3D y descárgalas en **STEP** o **STL** para imprimir o llevarlas a otro programa de CAD. Sin instalación, sin cuentas y sin enviar nada a ningún servidor.

### 👉 [Abrir GridUP BasicCAD](https://20leunam.github.io/GridUP-BasicCAD/)

`https://20leunam.github.io/GridUP-BasicCAD/`

---

## Qué puedes hacer

### Rejas
Generador paramétrico de rejas y celosías.

- Ancho, alto y fondo en mm.
- Marco perimetral con grosor ajustable.
- Barras verticales y horizontales: cantidad, grosor y desfase.
- Elementos decorativos: esfera, cubo, rombo, cono, cilindro y anillo, con tamaño y posición X/Y/Z.

### Piezas de revolución
Dibuja el perfil y gíralo alrededor del eje.

- Dibujo continuo: cada línea o arco empieza donde acabó el anterior, así que una pieza entera se dibuja pulsando puntos.
- Herramientas de línea, arco por 3 puntos, selección y borrado.
- Sección circular (torno), cuadrada, hexagonal u octogonal.
- Desplazamiento radial y calidad de malla.

### Extrusión
Dibuja un contorno cerrado en el plano y extrúyelo los mm que indiques.

- El mismo editor de dibujo que en revolución.
- Grosor de extrusión ajustable.
- Ejemplos listos: rectángulo, placa con extremo curvo y pieza en L.

## Controles

| Acción | Cómo |
|---|---|
| Orbitar el modelo 3D | Arrastrar con el botón izquierdo |
| Desplazar la vista | Shift + arrastrar, o botón derecho |
| Zoom | Rueda del ratón |
| Encuadrar | Doble clic en el visor |
| Terminar un trazo | `Esc`, doble clic o clic derecho |
| Cerrar un contorno | Pulsar sobre el primer punto |
| Deshacer | `Ctrl + Z` |
| Borrar la línea seleccionada | `Supr` |

Los puntos se imantan a la rejilla (0,1 / 0,5 / 1 / 5 mm) y a los vértices ya dibujados.

## Exportación

- **STEP** (AP214, B-rep facetado), para CAD.
- **STL** binario, para impresión 3D.

Las medidas están en milímetros y el eje Z es la altura. El color del visor es solo de previsualización y no afecta a los archivos exportados.

## Usarlo en local

No necesita compilar nada. Descarga el repositorio y abre `index.html` en el navegador.

```
git clone https://github.com/20leunam/GridUP-BasicCAD.git
```

## Estructura

```
index.html        interfaz
css/estilos.css   estilos
js/nucleo.js      mallas y primitivas 3D (torno, extrusión…)
js/boceto.js      editor de dibujo 2D
js/visor.js       visor 3D (three.js)
js/rejas.js       pestaña Rejas
js/revolucion.js  pestaña Piezas de revolución
js/extrusion.js   pestaña Extrusión
js/exportar.js    escritores STEP y STL
js/app.js         pestañas y controles
```

Usa [three.js](https://threejs.org/) para el visor 3D.
