// @flow
import fs from 'fs'
import SphericalMercator from '@mapbox/sphericalmercator' // https://github.com/mapbox/sphericalmercator
import getPNGData from './getPNG'
import getDarkLight from './getDarkLight'
import findLine from './findLine'
import inside from 'point-in-polygon'
import vtpbf from 'vt-pbf'
import geojsonVt from 'geojson-vt'

// https://www.mapbox.com/help/access-elevation-data/
// elevation = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)

export type Point = {
  lat: number,
  lon: number,
  elev: number,
  dark: number,
  light: number,
  set: boolean
}

export type FeatureCollection = {
  type: 'FeatureCollection',
  features: Array<Feature>,
  properties?: Object
}

export type Feature = {
  type: 'Feature',
  properties?: Object,
  tippecanoe?: {
    layer?: string,
    zoom?: number
  },
  geometry: {
    type: "MultiPolygon",
    coordinates: Array<Array<[number, number]>>
  }
}

export type ElevationContainerOptions = {
  smooth?: bool,
  verbose?: bool,
  size?: number,
  units?: string, // meters/feet (1 meter is equal to 3.2808398950131 feet)
  inputFolder?: string,
  tippecanoeLayer?: string
}

export default class ElevationContainer {
  inputFolder: string
  merc: SphericalMercator
  bbox: [number, number, number, number] // [left-lon, bottom-lat, right-lon, top-lat]
  elevArray: Array<Array<Point>>
  x: number
  y: number
  zoom: number
  smooth: bool
  size: number
  verbose: bool
  units: string
  tippecanoeLayer: string

  // STEP1) Get the bounding box, and create the array of lat/lon, so that we can add the elevations later
  constructor (x: number, y: number, zoom: number, options: ElevationContainerOptions) {
    this.inputFolder = options.inputFolder || './hillshades'
    this.elevArray = []
    this.x = x
    this.y = y
    this.zoom = zoom
    this.smooth = (options.smooth) ? options.smooth : true
    this.size = (options.size) ? options.size : 512
    this.verbose = (options.verbose) ? options.verbose : false
    this.units = (options.units) ? options.units : 'metric'
    this.tippecanoeLayer = (options.tippecanoeLayer) ? options.tippecanoeLayer : 'contourLines'
    this.merc = new SphericalMercator({ size: this.size })
    this.bbox = this.merc.bbox(x, y, zoom)
    if (this.verbose) console.log(`${zoom}, ${x}, ${y}`)
    // Prep the elevArray
    for (let y = 0; y < this.size + 2; y++) {
      this.elevArray.push([])
      for (let x = 0; x < this.size + 2; x++) {
        this.elevArray[y].push({ lat: 0, lon: 0, elev: -1, dark: 0, light: 0, set: false })
      }
    }
  }

  // STEP2) Now that the array is ready for input, lets get the elevation data at those positions.
  createElevationMatrix () {
    // utilizing the x, y, and zoom we get:
    return Promise.all([
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x - 1}/${this.y - 1}.png`, 'topLeft', this, this.x - 1, this.y - 1),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x}/${this.y - 1}.png`, 'top', this, this.x, this.y - 1),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x + 1}/${this.y - 1}.png`, 'topRight', this, this.x + 1, this.y - 1),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x - 1}/${this.y}.png`, 'left', this, this.x - 1, this.y),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x}/${this.y}.png`, 'center', this, this.x, this.y),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x + 1}/${this.y}.png`, 'right', this, this.x + 1, this.y),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x - 1}/${this.y + 1}.png`, 'bottomLeft', this, this.x - 1, this.y + 1),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x}/${this.y + 1}.png`, 'bottom', this, this.x, this.y + 1),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x + 1}/${this.y + 1}.png`, 'bottomRight', this, this.x + 1, this.y + 1)
    ])
  }

  // STEP3) find all dark and light values in the dataset
  createDarkLightLines () {
    if (this.verbose) console.log('SOLVING GREYSCALE...')

    for (let y = 1; y < 513; y++) { // one pixel less, so that we don't over stretch the x and y and look for data that does not exist
      for (let x = 1; x < 513; x++) {
        let grayValue = getDarkLight(this, y, x)
        if (grayValue) {
          this.elevArray[y][x].dark = grayValue[0]
          this.elevArray[y][x].light = grayValue[1]
        }
      }
    }
  }

  createDarkPoly (y: number, x: number, maxGreyValue: number): Array<[number, number]> {
    let xDirection: number = -1
    let yDirection: number = 0 // we always look the direction we came from to start
    let poly: Array<[number, number]> = [[this.elevArray[y][x].lon, this.elevArray[y][x].lat]]

    this.elevArray[y][x].set = true
    do {
      // ensure next point is within the dataset's boundary
      if (xDirection + x > 512 || xDirection + x < 1 || yDirection + y > 512 || yDirection + y < 1) { [yDirection, xDirection] = moveClockwise(y, x, yDirection, xDirection) }
      // find the next outer point
      while (this.elevArray[y + yDirection][x + xDirection].dark > maxGreyValue) { [yDirection, xDirection] = moveClockwise(y, x, yDirection, xDirection) }
      // now we know our new point:
      y = y + yDirection
      x = x + xDirection
      this.elevArray[y][x].set = true
      poly.push([this.elevArray[y][x].lon, this.elevArray[y][x].lat])
      // lastly set the new direction to look first (set yDirection and xDirection to look back at the previous and rotate once)
      yDirection = -yDirection
      xDirection = -xDirection;
      [yDirection, xDirection] = moveClockwise(y, x, yDirection, xDirection)
    } while (!(this.elevArray[y][x].lon === poly[0][0] && this.elevArray[y][x].lat === poly[0][1]))

    return poly
  }

  createDarkHull (maxGreyValue: number): Feature {
    let feature: Feature = {
      type: 'Feature',
      features: [],
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: []
      }
    }

    for (let y = 1; y < 513; y++) {
      for (let x = 1; x < 513; x++) {
        let point = this.elevArray[y][x]
        if (point.dark <= maxGreyValue && point.set === false) {
          // first check that the point is an outer edge point since we are searching each column value, we will hit a polygon edge horizontally first, so we only need to check x
          let poly
          if (x === 1 && y !== 512) {
            if (this.elevArray[y][x + 1].dark <= maxGreyValue || this.elevArray[y + 1][x + 1].dark <= maxGreyValue || this.elevArray[y + 1][x].dark <= maxGreyValue) { poly = this.createDarkPoly(y, x, maxGreyValue) }
          } else if (x === 512 && y !== 512) {
            if (this.elevArray[y + 1][x].dark <= maxGreyValue || this.elevArray[y + 1][x - 1].dark <= maxGreyValue) { poly = this.createDarkPoly(y, x, maxGreyValue) }
          } else if (y === 512) {
            if (x < 512 && this.elevArray[y][x + 1].dark <= maxGreyValue) { poly = this.createDarkPoly(y, x, maxGreyValue) }
          } else if (this.elevArray[y][x - 1].dark > maxGreyValue) {
            if (this.elevArray[y][x + 1].dark <= maxGreyValue || this.elevArray[y + 1][x + 1].dark <= maxGreyValue || this.elevArray[y + 1][x].dark <= maxGreyValue || this.elevArray[y + 1][x - 1].dark <= maxGreyValue) { poly = this.createDarkPoly(y, x, maxGreyValue) }
          }
          if (!poly || !poly.length) { continue }
          // first simplify lines
          if (poly.length > 6 && this.zoom >= 10) {
            poly = poly.filter((_, i) => { // $FlowIgnore
              if (i !== 0 && i !== (poly.length - 1) && i % 2 === 0) { return false }
              return true
            })
          }
          // second reduce point count
          for (let t = 2; t < poly.length; t++) {
            // if the angle of the first is the same as the angle of the second, drop the point
            if (getAngle(poly[t - 2], poly[t]) === getAngle(poly[t - 2], poly[t - 1])) {
              poly.splice(t - 1, 1)
              t--
            }
          }
          // then we iterate feature.geometry.coordinates and check if polygons exist, if they do, check if that polygon inhabits the current poly (thus finding a hole)
          if (poly.length >= 5) {
            let insidePoly = false
            for (let i = 0, fl = feature.geometry.coordinates.length; i < fl; i++) {
              if (inside(poly[0], feature.geometry.coordinates[i][0])) {
                insidePoly = true // $FlowFixMe
                feature.geometry.coordinates[i].push(poly)
                break
              }
            }
            if (!insidePoly) { // $FlowFixMe
              feature.geometry.coordinates.push([poly])
            }
          }
        }
      }
    }

    return feature
  }

  createLightPoly (y: number, x: number, maxGreyValue: number): Array<[number, number]> {
    let xDirection: number = -1
    let yDirection: number = 0 // we always look the direction we came from to start
    let poly: Array<[number, number]> = [[this.elevArray[y][x].lon, this.elevArray[y][x].lat]]

    this.elevArray[y][x].set = true
    do {
      // ensure next point within boundary
      if (xDirection + x > 512 || xDirection + x < 1 || yDirection + y > 512 || yDirection + y < 1) { [yDirection, xDirection] = moveClockwise(y, x, yDirection, xDirection) }
      // find the next outer point
      while (this.elevArray[y + yDirection][x + xDirection].light > maxGreyValue) { [yDirection, xDirection] = moveClockwise(y, x, yDirection, xDirection) }
      // now we know our new point:
      y = y + yDirection
      x = x + xDirection
      this.elevArray[y][x].set = true
      poly.push([this.elevArray[y][x].lon, this.elevArray[y][x].lat])
      // lastly set the new direction to look first (set yDirection and xDirection to look back at the previous and rotate once)
      yDirection = -yDirection
      xDirection = -xDirection;
      [yDirection, xDirection] = moveClockwise(y, x, yDirection, xDirection)
    } while (!(this.elevArray[y][x].lon === poly[0][0] && this.elevArray[y][x].lat === poly[0][1]))

    return poly
  }

  createLightHull (maxGreyValue: number): Feature {
    let feature: Feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: []
      }
    }

    for (let y = 1; y < 513; y++) {
      for (let x = 1; x < 513; x++) {
        let point = this.elevArray[y][x]
        if (point.light <= maxGreyValue && point.set === false) {
          // first check that the point is an outer edge point since we are searching each column value, we will hit a polygon edge horizontally first, so we only need to check x
          let poly
          if (x === 1 && y !== 512) {
            if (this.elevArray[y][x + 1].light <= maxGreyValue || this.elevArray[y + 1][x + 1].light <= maxGreyValue || this.elevArray[y + 1][x].light <= maxGreyValue) { poly = this.createLightPoly(y, x, maxGreyValue) }
          } else if (x === 512 && y !== 512) {
            if (this.elevArray[y + 1][x].light <= maxGreyValue || this.elevArray[y + 1][x - 1].light <= maxGreyValue) { poly = this.createLightPoly(y, x, maxGreyValue) }
          } else if (y === 512) {
            if (x < 512 && this.elevArray[y][x + 1].light <= maxGreyValue) { poly = this.createLightPoly(y, x, maxGreyValue) }
          } else if (this.elevArray[y][x - 1].light > maxGreyValue) {
            if (this.elevArray[y][x + 1].light <= maxGreyValue || this.elevArray[y + 1][x + 1].light <= maxGreyValue || this.elevArray[y + 1][x].light <= maxGreyValue || this.elevArray[y + 1][x - 1].light <= maxGreyValue) { poly = this.createLightPoly(y, x, maxGreyValue) }
          }
          if (!poly || !poly.length) { continue }
          // first simplify lines at higher zooms so they look good (look really choppy at high zooms)
          else if (poly.length > 6 && this.zoom >= 10) {
            poly = poly.filter((_, i) => { // $FlowIgnore
              if (i !== 0 && i !== (poly.length - 1) && i % 2 === 0) { return false }
              return true
            })
          }
          // second reduce point count if following same line
          for (let t = 2; t < poly.length; t++) {
            // if the angle of the first is the same as the angle of the second, drop the point
            if (getAngle(poly[t - 2], poly[t]) === getAngle(poly[t - 2], poly[t - 1])) {
              poly.splice(t - 1, 1)
              t--
            }
          }
          // then we iterate feature.geometry.coordinates and check if polygons exist, if they do, check if that polygon inhabits the current poly (thus finding a hole)
          if (poly.length >= 5) {
            let insidePoly = false
            for (let i = 0, fl = feature.geometry.coordinates.length; i < fl; i++) {
              if (inside(poly[0], feature.geometry.coordinates[i][0])) {
                insidePoly = true // $FlowFixMe
                feature.geometry.coordinates[i].push(poly)
                break
              }
            }
            if (!insidePoly) { // $FlowFixMe
              feature.geometry.coordinates.push([poly])
            }
          }
        }
      }
    }

    return feature
  }

  resetHull () {
    for (let y = 1; y < 513; y++) {
      for (let x = 1; x < 513; x++) {
        this.elevArray[y][x].set = false
      }
    }
  }

  saveFeatureCollection (name: string, type: string = 'geojson') {
    let hullDarknesses = getDarkness(this.zoom)
    if (this.verbose) { console.log('CREATING HULL...') }
    let featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    }

    let hull = this.createDarkHull(hullDarknesses[0])
    if (hull) {
      hull.properties = { class: 'shadow', level: 'ultra' }
      hull.tippecanoe = { layer: this.tippecanoeLayer }
      featureCollection.features.push(hull)
    }
    this.resetHull()

    hull = this.createDarkHull(hullDarknesses[1])
    if (hull) {
      hull.properties = { class: 'shadow', level: 'high' }
      hull.tippecanoe = { layer: this.tippecanoeLayer }
      featureCollection.features.push(hull)
    }
    this.resetHull()

    hull = this.createDarkHull(hullDarknesses[2])
    if (hull) {
      hull.properties = { class: 'shadow', level: 'medium' }
      hull.tippecanoe = { layer: this.tippecanoeLayer }
      featureCollection.features.push(hull)
    }
    this.resetHull()

    hull = this.createDarkHull(hullDarknesses[3])
    if (hull) {
      hull.properties = { class: 'shadow', level: 'low' }
      hull.tippecanoe = { layer: this.tippecanoeLayer }
      featureCollection.features.push(hull)
    }
    this.resetHull()

    hull = this.createLightHull(hullDarknesses[4])
    if (hull) {
      hull.properties = { class: 'highlight', level: 'high' }
      hull.tippecanoe = { layer: this.tippecanoeLayer }
      featureCollection.features.push(hull)
    }
    this.resetHull()

    hull = this.createLightHull(hullDarknesses[5])
    if (hull) {
      hull.properties = { class: 'highlight', level: 'low' }
      hull.tippecanoe = { layer: this.tippecanoeLayer }
      featureCollection.features.push(hull)
    }

    if (this.verbose) { console.log('SAVING...') }
    if (type === 'geojson') {
      if (featureCollection.features.length) {
        fs.writeFileSync(name, JSON.stringify(featureCollection))
      } else {
        fs.writeFileSync(name, JSON.stringify(''))
      }
    } else { // pbf
      let tileindex = geojsonVt(featureCollection)
      let tile: Object = tileindex.getTile(this.zoom, this.x, this.y)
      let buff: Buffer = vtpbf.fromGeojsonVt({ 'hillshadeRegia': tile })
      fs.writeFileSync(name, buff)
    }
  }
}

function moveClockwise (y: number, x: number, yDirection: number, xDirection: number): [number, number] {
  if (yDirection === 0 && xDirection === 1) {
    yDirection = 1
  } else if (yDirection === 1 && xDirection === 1) {
    xDirection = 0
  } else if (yDirection === 1 && xDirection === 0) {
    xDirection = -1
  } else if (yDirection === 1 && xDirection === -1) {
    yDirection = 0
  } else if (yDirection === 0 && xDirection === -1) {
    yDirection = -1
  } else if (yDirection === -1 && xDirection === -1) {
    xDirection = 0
  } else if (yDirection === -1 && xDirection === 0) {
    xDirection = 1
  } else {
    yDirection = 0
  }

  if (xDirection + x > 512 || xDirection + x < 1 || yDirection + y > 512 || yDirection + y < 1) {
    return moveClockwise(y, x, yDirection, xDirection)
  } else {
    return [yDirection, xDirection]
  }
}

function getAngle (p1: [number, number], p2: [number, number]) {
  let rads: number = Math.atan2(p1[0] - p2[0], p1[1] - p2[1])
  // We need to map to coord system when 0 degree is at 3 O'clock, 270 at 12 O'clock
  if (rads < 0) {
    return Math.abs(rads)
  } else {
    return 2 * Math.PI - rads
  }
}

function getDarkness (zoom: number): Array<number> {
  if (zoom === 5) {
    return [-5000, -170, -155, -120, -5000, -5000]
  } else if (zoom === 6) {
    return [-190, -160, -140, -120, -150, -180]
  } else if (zoom === 7) {
    return [-175, -145, -120, -100, -140, -165]
  } else if (zoom === 8) {
    return [-160, -135, -110, -45, -110, -145]
  } else if (zoom === 9) {
    return [-155, -130, -70, -10, -90, -135]
  } else if (zoom === 10) {
    return [-145, -95, -35, 3, -80, -135]
  } else if (zoom === 11) {
    return [-120, -60, 0, 30, -55, -125]
  } else if (zoom === 12) {
    return [-50, -20, 55, 95, 0, -70]
  } else if (zoom === 13) {
    return [7, 45, 120, 140, 55, 5]
  } else if (zoom === 14) {
    return [55, 100, 140, 160, 120, 80]
  } else {
    return [55, 100, 140, 160, 120, 80]
  }
}
