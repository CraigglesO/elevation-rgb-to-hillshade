// @flow
import fs from 'fs'
import SphericalMercator from '@mapbox/sphericalmercator' // https://github.com/mapbox/sphericalmercator
// Note: saved for posterity: import simplify from 'simplify-geojson' // https://github.com/maxogden/simplify-geojson
import getPNGData from './getPNG'
import findLine from './findLine'
import smooth from './smooth'

import type { FeatureCollection } from './smooth'

// https://www.mapbox.com/help/access-elevation-data/
// elevation = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)

export type Point = {
  lat: number,
  lon: number,
  elev: number
}

export type Contours = {
  [key: string | number]: Array< Array<Array<number>> > // an array of 2 point lineStrings
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
  bbox: Array<number> // [left-lon, bottom-lat, right-lon, top-lat]
  elevArray: Array<Array<Point>>
  contours: Contours
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
    this.contours = {}
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
        this.elevArray[y].push({ lat: 0, lon: 0, elev: -1 })
      }
    }
  }

  // STEP2) Now that the array is ready for input, lets get the elevation data at those positions.
  createElevationMatrix () {
    // there will be 9 parts but we need 5 for all contours to line up correctly with no overlap
    // utilizing the x, y, and zoom we get:
    return Promise.all([
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x - 1}/${this.y - 1}.png`, 'topLeft', this, this.x - 1, this.y - 1),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x}/${this.y - 1}.png`, 'top', this, this.x, this.y - 1),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x - 1}/${this.y}.png`, 'left', this, this.x - 1, this.y),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x}/${this.y}.png`, 'center', this, this.x, this.y),
      getPNGData(`${this.inputFolder}/${this.zoom}/${this.x - 1}/${this.y + 1}.png`, 'bottomLeft', this, this.x - 1, this.y + 1)
    ])
  }

  // STEP3) Create the contour lines;
  // TODO: a & b can be merged. This was made on the fly, but as you can see they overlap
  createContourLines (getStep?: Function = getStepSize) {
    // a) Figure out the max/min from each contour block's elev that exist within the dataset:
    let minElev = 100000000
    let maxElev = -1
    for (let y = 0; y < this.size + 2; y++) {
      for (let x = 0; x < this.size + 2; x++) {
        let elev = this.elevArray[y][x].elev
        if (elev === -1) continue
        if (elev > maxElev) { maxElev = elev }
        if (elev < minElev) { minElev = elev }
      }
    }
    // flatten data
    minElev = Math.ceil(minElev)
    maxElev = Math.floor(maxElev)
    let incr = minElev
    // using our known limits, increment and find all lines within the stepsize
    let stepSize: number = getStep(this.zoom)
    while (incr <= maxElev) {
      if (incr % stepSize === 0) { this.contours[incr] = [] }
      incr++
    }

    if (this.verbose) console.log('SOLVING...')

    // b) iterating through each "plane", check if any contours intersect the z-axis. If so, find the line and add it to that stack
    for (let y = 0; y < this.size; y++) { // one pixel less, so that we don't over stretch the x and y and look for data that does not exist
      for (let x = 0; x < this.size; x++) {
        minElev = 100000000
        maxElev = -1
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 2; i++) {
            let elevation = this.elevArray[y + j][x + i].elev
            if (elevation === -1) continue
            if (elevation > maxElev) { maxElev = elevation }
            if (elevation < minElev) { minElev = elevation }
          }
        }

        for (let key in this.contours) {
          key = parseInt(key)
          if (key >= minElev && key <= maxElev) {
            let lineString = findLine(this, y, x, key)
            if (lineString) { this.contours[key].push(lineString) }
          }
        }
      }
    }
  }

  // Step4) Conjoin all the lines that can be joined.
  contoursToMultiLineStrings () {
    if (this.verbose) console.log('JOINING...')

    for (let key in this.contours) {
      // grab the completely seperated multilinestring:
      let multilinestring = this.contours[key]
      // now we iterate through and see if we can make connections, if we make no new ones, we stop:
      let newConnections = true
      while (newConnections) {
        newConnections = false
        for (let j = 0; j < multilinestring.length; j++) {
          for (let i = 0; i < multilinestring.length; i++) {
            if (i !== j && multilinestring[i] && multilinestring[j]) {
              // can we conjoin the linestrings at j and i? If we can, then we found a connection and
              // we need to add grow j and remove i (remember to remove one of the points that are the same)
              let iLength = multilinestring[i].length - 1
              let jLength = multilinestring[j].length - 1
              if (arraysEqual(multilinestring[i][0], multilinestring[j][jLength])) {
                multilinestring[i].splice(0, 1)
                multilinestring[j] = multilinestring[j].concat(multilinestring[i])
                multilinestring.splice(i, 1)
                i-- // don't skip
                newConnections = true
              } else if (arraysEqual(multilinestring[i][iLength], multilinestring[j][0])) {
                multilinestring[j].splice(0, 1)
                multilinestring[j] = multilinestring[i].concat(multilinestring[j])
                multilinestring.splice(i, 1)
                i-- // don't skip
                newConnections = true
              } else if (arraysEqual(multilinestring[i][0], multilinestring[j][0])) { // both start with the same
                multilinestring[i].splice(0, 1)
                multilinestring[j] = multilinestring[i].reverse().concat(multilinestring[j])
                multilinestring.splice(i, 1)
                i-- // don't skip
                newConnections = true
              } else if (arraysEqual(multilinestring[i][iLength], multilinestring[j][jLength])) {
                multilinestring[i].splice(iLength, 1)
                multilinestring[j] = multilinestring[j].concat(multilinestring[i].reverse())
                multilinestring.splice(i, 1)
                i-- // don't skip
                newConnections = true
              }
            }
          }
        }
      }
      // now we apply that new multilinestring to our contours:
      this.contours[key] = multilinestring
    }
  }

  saveFeatureCollection (name: string, getInd?: Function = getIndex) {
    if (this.verbose) console.log(`SAVING '${name}'...`)
    let featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: []
    }
    // save the contour lines
    for (let key in this.contours) {
      key = parseInt(key)
      for (let i = 0; i < this.contours[key].length; i++) {
        let line = this.contours[key][i]
        let feature = {
          type: 'Feature',
          properties: { ele: key, index: getInd(key, this.zoom) },
          tippecanoe: { layer: this.tippecanoeLayer },
          geometry: {
            type: 'LineString',
            coordinates: line
          }
        }
        featureCollection.features.push(feature)
      }
    }

    if (this.smooth) featureCollection = smooth(featureCollection)

    fs.writeFileSync(name, JSON.stringify(featureCollection))
  }
}

function getStepSize (zoom: number): number {
  if (zoom === 11) {
    return 100
  } else if (zoom === 12) {
    return 50
  } else if (zoom === 13) {
    return 20
  } else if (zoom === 14) {
    return 10
  } else return 1 // this 'should' never happen, user's can make their own stepsize should they need more
}

function getIndex (key, zoom) {
  if (zoom === 11) {
    return key / 100 % 10
  } else if (zoom === 12) {
    return key / 50 % 10
  } else if (zoom === 13) {
    return key / 20 % 10
  } else if (zoom === 14) {
    return key / 10 % 10
  } else return key // this 'should' never happen, user's can make their own indexing should they need more
}

function arraysEqual (_arr1, _arr2) {
  if (_arr1[0] === _arr2[0] && _arr1[1] === _arr2[1]) { return true } else { return false }
}

// NOTE: saved for posterity
// function removeDuplicateLines(contourLines: Array< Array<Array<number>> >) {
//   for (let j = 0; j < arr.length; j++) {
//     for (let i = 1; i < arr.length; i++) {
//       if (i !== j && arr[i][0] === arr[j][0] && arr[i][1] === arr[j][1]) {
//         arr.splice(i,1);
//         i--;
//       }
//     }
//   }
// }
