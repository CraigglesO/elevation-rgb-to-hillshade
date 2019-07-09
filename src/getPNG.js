// @flow
import fs from 'fs'
import { PNG } from 'pngjs'
import SphericalMercator from '@mapbox/sphericalmercator' // https://github.com/mapbox/sphericalmercator
import ElevationContainer from './elevationContainer'

// https://www.mapbox.com/help/access-elevation-data/
// elevation = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)

// NOTE: This is important, when reading PNG's, you start from the bottom left for some reason (the y/height is inverted)

type PositionEnum = 'topLeft' | 'top' | 'topRight' | 'left' | 'center' | 'right' | 'bottomLeft' | 'bottom' | 'bottomRight'

export default function getPNGData (fileLocation: string, position: PositionEnum, elevContainer: ElevationContainer, mercX: number, mercY: number): Promise<typeof undefined> {
  return new Promise((resolve, reject) => {
    // first check if the file exists:
    if (!fs.existsSync(fileLocation)) {
      if (position === 'center') reject(new Error('file does not exist'))
      else resolve()
    } else {
      let size = elevContainer.size
      let merc: SphericalMercator = new SphericalMercator({ size })
      let bbox: [number, number, number, number] = merc.bbox(mercX, mercY, elevContainer.zoom)
      let lonRange: number = bbox[2] - bbox[0]
      let latRange: number = bbox[3] - bbox[1]
      let lonOnePixel = lonRange / size
      let latOnePixel = latRange / size
      // the origin is one block up and one block left, as we need data outside our image to ensure the lines "line-up" post processing
      let originLon = bbox[0] + (lonOnePixel / 2) // remember that we want the centerpoints, not the outer edges, so we add a half.
      let originLat = bbox[3] + (latOnePixel / 2) // we want to start top left for reading the PNG's sake.
      // if it does we setup the stream
      fs.createReadStream(fileLocation)
        .pipe(new PNG())
        .on('parsed', function () {
          let getElevation = (elevContainer.units === 'feet') // otherwise metric ((1 meter is equal to 3.2808398950131 feet))
            ? (idx) => { return (-10000 + ((this.data[idx] * 256 * 256 + this.data[idx + 1] * 256 + this.data[idx + 2]) * 0.1)) * 3.2808398950131 }
            : (idx) => { return -10000 + ((this.data[idx] * 256 * 256 + this.data[idx + 1] * 256 + this.data[idx + 2]) * 0.1) }
          if (position === 'topLeft') {
            // We are just getting the bottom right pixel from the image and adding it to the top left:
            let idx = (this.width * (size - 1) + (size - 1)) << 2
            let elevation = getElevation(idx)
            elevContainer.elevArray[0][0].elev = elevation
            elevContainer.elevArray[0][0].lat = originLat - ((size - 1) * latOnePixel)
            elevContainer.elevArray[0][0].lon = originLon + ((size - 1) * lonOnePixel)
          } else if (position === 'top') {
            // We are just getting the bottom pixels from the image and adding it to the top:
            for (let x = 0; x < this.width; x++) {
              let idx = (this.width * (size - 1) + x) << 2
              let elevation = getElevation(idx)
              elevContainer.elevArray[0][x + 1].elev = elevation // NOTE: the start for the top is 1 block from origin
              elevContainer.elevArray[0][x + 1].lat = originLat - ((size - 1) * latOnePixel)
              elevContainer.elevArray[0][x + 1].lon = originLon + (x * lonOnePixel)
            }
          } else if (position === 'topRight') {
            // We are just getting the bottom left pixel from the image and adding it to the top right:
            let idx = (this.width * (size - 1) + 0) << 2
            let elevation = getElevation(idx)
            elevContainer.elevArray[0][size + 1].elev = elevation
            elevContainer.elevArray[0][size + 1].lat = originLat - ((size - 1) * latOnePixel)
            elevContainer.elevArray[0][size + 1].lon = originLon
          } else if (position === 'left') {
            // We are just getting the rightmost pixels from the image and adding it to the left:
            for (let y = 0; y < this.height; y++) {
              let idx = (this.width * y + (size - 1)) << 2
              let elevation = getElevation(idx)
              elevContainer.elevArray[y + 1][0].elev = elevation // // NOTE: the start for the left is 1 block from origin
              elevContainer.elevArray[y + 1][0].lat = originLat - (y * latOnePixel)
              elevContainer.elevArray[y + 1][0].lon = originLon + ((size - 1) * lonOnePixel)
            }
          } else if (position === 'center') {
            for (let y = 0; y < this.height; y++) {
              for (let x = 0; x < this.width; x++) {
                let idx = (this.width * y + x) << 2
                let elevation = getElevation(idx)
                elevContainer.elevArray[y + 1][x + 1].elev = elevation // NOTE: the center is 1 block from origin in both directions
                elevContainer.elevArray[y + 1][x + 1].lat = originLat - (y * latOnePixel)
                elevContainer.elevArray[y + 1][x + 1].lon = originLon + (x * lonOnePixel)
              }
            }
          } else if (position === 'right') {
            // We are just getting the leftmost pixels from the image and adding it to the right:
            for (let y = 0; y < this.height; y++) {
              let idx = (this.width * y + 0) << 2
              let elevation = getElevation(idx)
              elevContainer.elevArray[y + 1][size + 1].elev = elevation // // NOTE: the start for the left is 1 block from origin
              elevContainer.elevArray[y + 1][size + 1].lat = originLat - (y * latOnePixel)
              elevContainer.elevArray[y + 1][size + 1].lon = originLon
            }
          } else if (position === 'bottomLeft') {
            // We are just getting the top right pixel from the image and adding it to the bottom left:
            let idx = (this.width * 0 + (size - 1)) << 2
            let elevation = getElevation(idx)
            elevContainer.elevArray[size + 1][0].elev = elevation
            elevContainer.elevArray[size + 1][0].lat = originLat
            elevContainer.elevArray[size + 1][0].lon = originLon + ((size - 1) * lonOnePixel)
          } else if (position === 'bottom') {
            // We are just getting the top-most pixels from the image and adding it to the bottom:
            for (let x = 0; x < this.width; x++) {
              let idx = (this.width * 0 + x) << 2
              let elevation = getElevation(idx)
              elevContainer.elevArray[size + 1][x + 1].elev = elevation // NOTE: the start for the bottom is 1 block from origin
              elevContainer.elevArray[size + 1][x + 1].lat = originLat
              elevContainer.elevArray[size + 1][x + 1].lon = originLon + (x * lonOnePixel)
            }
          } else if (position === 'bottomRight') {
            // We are just getting the top-left pixel from the image and adding it to the bottom right:
            let idx = (this.width * 0 + 0) << 2
            let elevation = getElevation(idx)
            elevContainer.elevArray[size + 1][size + 1].elev = elevation
            elevContainer.elevArray[size + 1][size + 1].lat = originLat
            elevContainer.elevArray[size + 1][size + 1].lon = originLon
          }
          resolve()
        })
        .on('error', error => {
          reject(new Error(error))
        })
    }
  })
}
