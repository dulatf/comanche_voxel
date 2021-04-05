let data = {
  canvas: null,
  context: null,
  imageBuffer: null,
  heightBuffer: null,
  frames: 0,
  lastFrameTime: new Date().getTime()
};

const mapData = {
  width: 1024,
  height: 1024,
  heightMap: new Uint8Array(1024 * 1024),
  colorMap: new Uint32Array(1024 * 1024)
};

let inputData = {
  speed: 0.0,
  rotation: 0.0,
  mousePosition: null,
  time: null,
};

let cameraData = {angle: 0.0, pos: {x: 512.0, y: 512.0}};

function GetMousePosition(e) {
  if (e.type.startsWith('touch')) {
    return [e.targetTouches[0].pageX, e.targetTouches[0].pageY];
  } else {
    return [e.pageX, e.pageY];
  }
}

function onMouseDown(e) {
  if (e.button == 0) {
    inputData.speed = 3.0;
  } else if (e.button == 2) {
    inputData.speed = -3.0;
  }
  inputData.mousePosition = GetMousePosition(e);
  inputData.time = new Date().getTime();
}
function onMouseUp(e) {
  inputData.speed = 0.0;
  inputData.mousePosition = null;
  inputData.time = null;
}
function onMouseMove(e) {
  e.preventDefault();
  if (inputData.mousePosition == null || inputData.speed == 0.0) {
    return;
  }
  const cur = GetMousePosition(e);
  inputData.rotation =
      (inputData.mousePosition[0] - cur[0]) / window.innerWidth * 2;
}
function onResizeWindow() {
  console.log('Resized!');
  data.canvas = document.getElementById('canvas');
  const aspect = window.innerWidth / window.innerHeight;
  data.canvas.width = window.innerWidth < 800 ? window.innerWidth : 800;
  data.canvas.height = data.canvas.width / aspect;

  data.context = data.canvas.getContext('2d');
  data.imageBuffer =
      data.context.createImageData(data.canvas.width, data.canvas.height);
  data.heightBuffer = new Uint32Array(data.canvas.width);
}



function downloadImagesAsync(urls) {
  return new Promise((resolve, reject) => {
    let pending = urls.length;
    let result = [];
    if (pending == 0) {
      resolve([]);
      return;
    }
    urls.forEach((url, i) => {
      let img = new Image();
      img.onload = () => {
        let tcv = document.createElement('canvas');
        let tctx = tcv.getContext('2d');
        tcv.width = mapData.width;
        tcv.height = mapData.height;
        tctx.drawImage(img, 0, 0, mapData.width, mapData.height);
        result[i] = tctx.getImageData(0, 0, mapData.width, mapData.height).data;
        pending--;
        if (pending == 0) {
          console.log(url + ' loaded');
          resolve(result);
        }
      };
      img.src = url;
    });
  });
}
function onLoadedImages(res) {
  let datac = res[0];
  let datah = res[1];
  for (let i = 0; i < mapData.width * mapData.height; i++) {
    mapData.heightMap[i] = datah[i << 2];
    mapData.colorMap[i] = 0xFF000000 | (datac[(i << 2) + 2] << 16) |
        (datac[(i << 2) + 1] << 8) | (datac[(i << 2) + 0]);
  }
}
function loadMaps(maps) {
  return downloadImagesAsync(maps.map((x) => {return 'maps/' + x + '.png'}))
      .then(onLoadedImages);
}

function drawVerticalLine(x, y, ymax, col) {
  for (let i = y; i < ymax; i++) {
    const idx = x + i * data.canvas.width;
    data.imageBuffer.data[idx * 4 + 0] = (col & (0xFF << 16)) >> 16;
    data.imageBuffer.data[idx * 4 + 1] = (col & (0xFF << 8)) >> 8;
    data.imageBuffer.data[idx * 4 + 2] = (col & (0xFF << 0)) >> 0;
    data.imageBuffer.data[idx * 4 + 3] = 255;
  }
}

function drawPixel(x, y, col) {
  const idx = x + y * data.canvas.width;
  data.imageBuffer.data[idx * 4 + 0] = (col & (0xFF << 16)) >> 16;
  data.imageBuffer.data[idx * 4 + 1] = (col & (0xFF << 8)) >> 8;
  data.imageBuffer.data[idx * 4 + 2] = (col & (0xFF << 0)) >> 0;
  data.imageBuffer.data[idx * 4 + 3] = 255;
}
function sampleHeightMap(x, y) {
  x = (((x | 0) % mapData.width) + mapData.width) % mapData.width;
  y = (((y | 0) % mapData.height) + mapData.height) % mapData.height;

  return mapData.heightMap[x + (y * mapData.width)];
}
function sampleColorMap(x, y) {
  x = (((x | 0) % mapData.width) + mapData.width) % mapData.width;
  y = (((y | 0) % mapData.height) + mapData.height) % mapData.height;

  return mapData.colorMap[x + (y * mapData.width)];
}

// sample on arc segments
function render(pos, phi, horizon, scale_height, distance, fov) {
  const sinphi = Math.sin(phi);
  const cosphi = Math.cos(phi);
  for (let i = 0; i < data.canvas.width; i++) {
    data.heightBuffer[i] = data.canvas.height;
  }
  for (let z = 1; z < distance; z++) {
    for (let i = 0; i < data.canvas.width; i++) {
      const angle = phi - fov / 2 + fov / data.canvas.width * i;
      const sx = Math.cos(angle) * z + pos.x;
      const sy = Math.sin(angle) * z + pos.y;
      const height_on_screen =
          (pos.height - sampleHeightMap(sx, sy)) / z * scale_height + horizon;
      const cval = sampleColorMap(sx, sy);
      drawVerticalLine(i, height_on_screen | 0, data.heightBuffer[i] | 0, cval);
      if (height_on_screen < data.heightBuffer[i]) {
        data.heightBuffer[i] = height_on_screen;
      }
    }
  }
}

let angle = 0.0;
function frame() {
  data.frames++;
  clear();
  update();
  render(
      {x: cameraData.pos.x, y: cameraData.pos.y, height: 100}, cameraData.angle,
      120, 200, 500, Math.PI / 2);
  angle += 0.01;
  if (angle > Math.PI * 2) {
    angle -= 2 * Math.PI;
  }
  data.context.putImageData(data.imageBuffer, 0, 0);
  window.requestAnimationFrame(frame);
}
function update() {
  const cur = new Date().getTime();
  const delt = (cur - inputData.time) * 0.03;
  if (inputData.mousePosition) {
    cameraData.angle -= inputData.rotation * 0.1 * delt;
    cameraData.pos.x += inputData.speed * Math.cos(cameraData.angle) * delt;
    cameraData.pos.y += inputData.speed * Math.sin(cameraData.angle) * delt;
  }
  inputData.time = cur;
}

function clear() {
  for (let y = 0; y < data.canvas.height; y++) {
    for (let x = 0; x < data.canvas.width; x++) {
      const idx = x + y * data.canvas.width;
      data.imageBuffer.data[idx * 4 + 0] = 0x00;
      data.imageBuffer.data[idx * 4 + 1] = 0x66;
      data.imageBuffer.data[idx * 4 + 2] = 0x88;
      data.imageBuffer.data[idx * 4 + 3] = 255;
    }
  }
}

function init() {
  onResizeWindow();
  window.onresize = onResizeWindow;
  window.onmousedown = onMouseDown;
  window.ontouchstart = onMouseDown;
  window.onmouseup = onMouseUp;
  window.ontouchend = onMouseUp;
  window.onmousemove = onMouseMove;
  window.ontouchmove = onMouseMove;
  window.oncontextmenu = (e) => {
    e.preventDefault()
  };

  loadMaps(['C14', 'D14']).then(frame);
  window.setInterval(() => {
    const cur = new Date().getTime();
    const fps = data.frames / (cur - data.lastFrameTime) * 1000;
    data.frames = 0;
    data.lastFrameTime = cur;
    document.getElementById('fps').innerText = fps.toFixed(1);
  }, 500);
}

init();