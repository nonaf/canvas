var nonafCanvas = (function () {
'use strict';

function minMax(val, min, max) {
   return Math.min(max, Math.max(min, val));
}

function dimension(opts) {

   function calculateDim(redraw) {
      var canvas = opts.canvas;
      var size = opts.size;
      var zoomFactor = opts.zoomFactor;
      var rotation = opts.rotation;
      var width = canvas.width;
      var ratio = width/size.width;
      var height = size.height * ratio;
      var tX = 0, tY = 0;
      var _width = width;
      var _height = height;
      if (rotation == 1 || rotation == 3) {
         height = width * width/height;
         _width = height;
         _height = width;
      }
      if (rotation == 1) {
         tX = _height * zoomFactor;
      }
      else if (rotation == 2) {
         tX = _width * zoomFactor;
         tY = _height * zoomFactor;
      }
      else if (rotation == 3) {
         tY = _width * zoomFactor;
      }
      opts.ratio = ratio;
      opts.canvasWidth = Math.round(width);
      opts.canvasHeight = Math.round(height);
      opts.paintWidth = Math.round(_width * zoomFactor);
      opts.paintHeight = Math.round(_height * zoomFactor);
      if (!opts.noBounds) {
        if (rotation == 0 || rotation == 2) {
          opts.left = minMax(opts.left, opts.canvasWidth - opts.paintWidth, 0);
          opts.top = minMax(opts.top, opts.canvasHeight - opts.paintHeight, 0);
        } else {
          opts.left = minMax(opts.left, opts.canvasWidth - opts.paintHeight, 0);
          opts.top = minMax(opts.top, opts.canvasHeight - opts.paintWidth, 0);
        }
      }
      opts.tX = tX;
      opts.tY = tY;
      if (redraw) {
        opts.draw();
      }
   }
   calculateDim();
   return {calculateDim: calculateDim};
}

function pointNormalizer(opts) {

   function normalizePoint(x, y) {
      var canvas = opts.canvas;
      var viewBox = opts.viewBox;
      var zoomFactor = opts.zoomFactor;
      var left = opts.left;
      var top = opts.top;
      var rotation = opts.rotation;
      var bounds = canvas.getBoundingClientRect();
      var ratio = viewBox.width/canvas.width;
      var offsetX = x - bounds.left;
      var offsetY = y - bounds.top;
      var oldX = offsetX, oldY = offsetY;
      if (rotation == 1 || rotation == 3) {
         ratio = viewBox.width/canvas.height;
      }
      if (rotation == 1) {
         offsetY = canvas.width * zoomFactor - offsetX + left;
         offsetX = oldY - top;
      }
      else if (rotation == 2) {
         offsetX = canvas.width * zoomFactor - offsetX + left;
         offsetY = canvas.height * zoomFactor - offsetY + top;
      }
      else if (rotation == 3) {
         offsetX = canvas.height * zoomFactor - offsetY + top;
         offsetY = oldX - left;
      }
      else {
         offsetX -= left;
         offsetY -= top;
      }
      return [Math.round(viewBox.x + offsetX * ratio / zoomFactor), Math.round(viewBox.y + offsetY * ratio / zoomFactor)];
   }

   function denormalizePoint(x, y) {
      var canvas = opts.canvas;
      var size = opts.size;
      var zoomFactor = opts.zoomFactor;
      var rotation = opts.rotation;
      var ratio = canvas.width/size.width;
      if (rotation == 1 || rotation == 3) {
         ratio = canvas.height/size.width;
      }
      return [x * ratio * zoomFactor, y * ratio * zoomFactor];
   }

   function normalizePointList(list) {
      return list.map(function (point) {
         return normalizePoint(point[0], point[1]);
      });
   }

   function denormalizePointList(list) {
      return list.map(function (point) {
         return denormalizePoint(point[0], point[1]);
      });
   }

   return {normalizePoint: normalizePoint, normalizePointList: normalizePointList, denormalizePoint: denormalizePoint, denormalizePointList: denormalizePointList};
}

function transformHelper(opts) {

   function transform(target) {
      var tX = opts.tX;
      var tY = opts.tY;
      var left = opts.left;
      var top = opts.top;
      var rotations = opts.rotations;
      var rotation = opts.rotation;
      if (target instanceof Element) {
         target.style.transform = 'translate(' + left + 'px,' + top + 'px) rotate(' + rotations[rotation] +'rad)';
      } else {
         target.setTransform(1, 0, 0, 1, 0, 0);
         target.translate(tX + left, tY + top);
         target.rotate(rotations[rotation]);
      }
   }

   return {transform: transform};
}

var timerHandle;
var controlInterval = 200;
var speed = 1;

var actionTimer = {
  run: function (min, fn) {
    clearTimeout(timerHandle);
    timerHandle = setTimeout(function () {
      speed += .4;
      controlInterval = Math.max(controlInterval - 50, min);
      fn(Math.min(20, Math.round(speed)));
    }, controlInterval);
  },
  stop: function () {
    controlInterval = 200;
    speed = 1;
    clearTimeout(timerHandle);
  }
};

function zoomHelper(opts, normalizer, dimension) {

   var zoom = 100 * opts.zoomFactor;

   function setZoom(_zoom, ignoreCenter) {
      var center1, center2;
      var zoomCenter = opts.zoomCenter;
      var zoomFactor = opts.zoomFactor;
      center1 = normalizer.denormalizePoint(zoomCenter[0], zoomCenter[1]);
      zoom = Math.min(5000, Math.max(5, _zoom));
      opts.zoomFactor = zoom/100;
      if (!ignoreCenter && opts.zoomFactor != zoomFactor) {
         dimension.calculateDim();
         center2 = normalizer.denormalizePoint(zoomCenter[0], zoomCenter[1]);
         opts.left -= center2[0] - center1[0];
         opts.top -= center2[1] - center1[1];
      }
      dimension.calculateDim(1);
   }

   function changeZoom(diff) {
     if (zoom > 120) {
       diff *= opts.zoomFactor;
     }
     setZoom(zoom + diff);
   }

   function startZoom (dir, speed) {
      if ( speed === void 0 ) speed = 1;

      changeZoom(speed * dir);
      actionTimer.run(20, function (speed) {
         startZoom(dir, speed);
      });
   }

   function resetZoom() {
      zoom = 100;
      opts.zoomFactor = 1;
      dimension.calculateDim(1);
   }

   function getZoom() {
      return zoom;
   }

   return {setZoom: setZoom, resetZoom: resetZoom, changeZoom: changeZoom, startZoom: startZoom, getZoom: getZoom};
}

function panHelper(opts, dim) {

   function setPan(x, y) {
     opts.left = x;
     opts.top = y;
   }

   function changePan(dir, diff) {
     if (dir == 'left' || dir == 'right') {
        opts.left += diff * (dir == 'left' ? 1 : -1);
     }
     else {
        opts.top += diff * (dir == 'up' ? 1 : -1);
     }
     dim.calculateDim(1);
   }

   function startPan(dir, speed) {
     speed = speed || 1;
     changePan(dir, speed);
     actionTimer.run(20, function (speed) {
        startPan(dir, speed);
     });
   }

   return {setPan: setPan, changePan: changePan, startPan: startPan};
}

function utilities(opts, normalizer, dim, zHelper) {

   function reset() {
     opts.left = 0;
     opts.top = 0;
     opts.tX = 0;
     opts.tY = 0;
     opts.rotation = 0;
     zHelper.resetZoom();
   }

   function rotate(dir) {
     var rotation = opts.rotation;
     var rotations = opts.rotations;
     var size = opts.size;
     rotation += dir;
     if (rotation < 0) {
        rotation = rotations.length - 1;
     }
     else if (rotation >= rotations.length) {
        rotation = 0;
     }
     opts.rotation = rotation;
     var zoom = zHelper.getZoom();
     if (rotation % 2 == 1) {
        zHelper.setZoom(zoom * size.height / size.width, true);
     } else {
        zHelper.setZoom(zoom * size.width / size.height, true);
     }
   }

   function stopAction() {
     actionTimer.stop();
   }

   function setCenter(x, y) {
     opts.zoomCenter = normalizer.normalizePoint(x, y);
   }

   return {reset: reset, rotate: rotate, stopAction: stopAction, setCenter: setCenter};
}

function main (config) {
  var canvas = config.canvas;
  var size = config.size;
  var viewBox = config.viewBox;
  var draw = config.draw;
  var noBounds = config.noBounds;
   var opts = {
      canvas: canvas, size: size, viewBox: viewBox, draw: draw, noBounds: noBounds,
      ctx: canvas.getContext('2d'),
      rotations: [0, Math.PI/2, Math.PI, -Math.PI/2],
      rotation: 0,
      zoomFactor: 1,
      left: 0,
      top: 0,
      zoomCenter: [viewBox.width/2, viewBox.height/2]
   };
   var normalizer = pointNormalizer(opts);
   var dim = dimension(opts);
   var transHelper = transformHelper(opts);
   var zHelper = zoomHelper(opts, normalizer, dim);
   var pHelper = panHelper(opts, dim);
   var utils = utilities(opts, normalizer, dim, zHelper);
   return Object.assign(opts, normalizer, dim, transHelper, zHelper, pHelper, utils);
}

return main;

}());
