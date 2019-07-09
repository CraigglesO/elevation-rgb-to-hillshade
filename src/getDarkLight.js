// @flow
import ElevationContainer from './elevationContainer'

// https://pro.arcgis.com/en/pro-app/tool-reference/3d-analyst/how-hillshade-works.htm

const ZENITH_DEG: number = 45
const ZENITH_RAD: number = ZENITH_DEG * Math.PI / 180
// const AZIMUTH      = 335;
// const AZIMUTH_RAD  = (360.0 - AZIMUTH + 90) * Math.PI / 180;
const AZIMUTH: number = 0
const AZIMUTH_RAD: number = (360.0 - AZIMUTH + 90) * Math.PI / 180
const AZIMUTH2: number = 310
const AZIMUTH_RAD2: number = (360.0 - AZIMUTH2 + 90) * Math.PI / 180
const AZIMUTH3: number = 130
const AZIMUTH_RAD3: number = (360.0 - AZIMUTH3 + 90) * Math.PI / 180
const AZIMUTH4: number = 180
const AZIMUTH_RAD4: number = (360.0 - AZIMUTH4 + 90) * Math.PI / 180

let count = 0

export default function getDarkLight (elevContainer: ElevationContainer, y: number, x: number): Array<number> | null {
  // This is the last step...
  // Find the line that the contour would follow given 4 points (a plane). The origin is the x,y
  let elev: number = elevContainer.elevArray[y][x].elev
  let left: number = elevContainer.elevArray[y][x - 1].elev
  let topLeft: number = elevContainer.elevArray[y - 1][x - 1].elev
  let top: number = elevContainer.elevArray[y - 1][x].elev
  let topRight: number = elevContainer.elevArray[y - 1][x + 1].elev
  let right: number = elevContainer.elevArray[y][x + 1].elev
  let bottomRight: number = elevContainer.elevArray[y + 1][x + 1].elev
  let bottom: number = elevContainer.elevArray[y + 1][x].elev
  let bottomLeft: number = elevContainer.elevArray[y + 1][x - 1].elev

  if (elev === -1 || left === -1 || topLeft === -1 || top === -1 || topRight === -1 || right === -1 || bottomRight === -1 || bottom === -1 || bottomLeft === -1) { return null }

  // [dz/dx] = ((c + 2f + i) - (a + 2d + g)) / (8 * cellsize)
  let dz_dx: number = ((topRight + 2 * right + bottomRight) - (topLeft + 2 * left + bottomLeft)) / (8 * 5)
  // [dz/dy] = ((g + 2h + i) - (a + 2b + c)) / (8 * cellsize)
  let dz_dy: number = ((bottomLeft + 2 * bottom + bottomRight) - (topLeft + 2 * top + topRight)) / (8 * 5)
  // Slope_rad = ATAN ( z_factor * √ ([dz/dx]^2 + [dz/dy]^2))
  let z_factor: number = 1
  let slope_rad: number = Math.atan(z_factor * Math.sqrt(Math.pow(dz_dx, 2) + Math.pow(dz_dy, 2)))

  let aspect_rad: number = 0
  if (dz_dx === 0) {
    if (dz_dy > 0) { aspect_rad = Math.PI / 2 } else if (dz_dy < 0) { aspect_rad = 2 * Math.PI - Math.PI / 2 } else { aspect_rad = slope_rad }
  } else {
    aspect_rad = Math.atan2(dz_dy, -dz_dx)
    if (aspect_rad < 0) { aspect_rad = 2 * Math.PI + aspect_rad }
  }

  let darkOne: number = 255.0 * ((Math.cos(ZENITH_RAD) * Math.cos(slope_rad)) + (Math.sin(ZENITH_RAD) * Math.sin(slope_rad) * Math.cos(AZIMUTH_RAD - aspect_rad)))
  let darkTwo: number = 255.0 * ((Math.cos(ZENITH_RAD) * Math.cos(slope_rad)) + (Math.sin(ZENITH_RAD) * Math.sin(slope_rad) * Math.cos(AZIMUTH_RAD2 - aspect_rad)))
  let lightOne: number = 255.0 * ((Math.cos(ZENITH_RAD) * Math.cos(slope_rad)) + (Math.sin(ZENITH_RAD) * Math.sin(slope_rad) * Math.cos(AZIMUTH_RAD3 - aspect_rad)))
  let lightTwo: number = 255.0 * ((Math.cos(ZENITH_RAD) * Math.cos(slope_rad)) + (Math.sin(ZENITH_RAD) * Math.sin(slope_rad) * Math.cos(AZIMUTH_RAD4 - aspect_rad)))
  let dark: number = (darkOne <= darkTwo) ? darkOne : darkTwo
  let light: number = (lightOne <= lightTwo) ? lightOne : lightTwo
  return [dark, light]
}
