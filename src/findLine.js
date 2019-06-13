// @flow
import ElevationContainer from './elevationContainer'
import type { Point } from './elevationContainer'

export default function findLine (elevContainer: ElevationContainer, y: number, x: number, elev: number): Array<Array<number>> | null {
  let res = []
  // This is the last step...
  // Find the line that the contour would follow given 4 points (a plane). The origin is the x,y
  let topLeft = elevContainer.elevArray[y][x]
  let topRight = elevContainer.elevArray[y][x + 1]
  let bottomLeft = elevContainer.elevArray[y + 1][x]
  let bottomRight = elevContainer.elevArray[y + 1][x + 1]

  if (topLeft.elev === -1 || topRight.elev === -1 || bottomLeft.elev === -1 || bottomRight.elev === -1) { return null }

  // special case: sometimes the line exists ON the edge, so it will be counted twice...
  // also some high width tiles of equal value need to be processed appropriately
  let equalElevationCount = 0
  if (bottomLeft.elev === elev) { equalElevationCount++ }
  if (bottomRight.elev === elev) { equalElevationCount++ }
  if (topLeft.elev === elev) { equalElevationCount++ }
  if (topRight.elev === elev) { equalElevationCount++ }

  if (equalElevationCount === 4) {
    return null
  } else if (equalElevationCount === 3) {
    // find the odd man out, create an angle from the two IF the odd man out is lower:
    if (topLeft.elev < elev || bottomRight.elev < elev) { return [[topRight.lon, topRight.lat], [bottomLeft.lon, bottomLeft.lat]] } else if (topRight.elev < elev || bottomLeft.elev < elev) { return [[topLeft.lon, topLeft.lat], [bottomRight.lon, bottomRight.lat]] } else { return null }
  } else if (equalElevationCount === 2) {
    // if the equal to elev ones are corners: just save those two points:
    if (topLeft.elev === bottomRight.elev) { return [[topLeft.lon, topLeft.lat], [bottomRight.lon, bottomRight.lat]] }
    if (topRight.elev === bottomLeft.elev) { return [[topRight.lon, topRight.lat], [bottomLeft.lon, bottomLeft.lat]] }
    // if the other two points are below, we add the line of the two equal, otherwise, return null
    let lower = false
    if (topLeft.elev === elev) { res.push([topLeft.lon, topLeft.lat]) } else if (!lower && topLeft.elev < elev) { lower = true }
    if (topRight.elev === elev) { res.push([topRight.lon, topRight.lat]) } else if (!lower && topRight.elev < elev) { lower = true }
    if (bottomLeft.elev === elev) { res.push([bottomLeft.lon, bottomLeft.lat]) } else if (!lower && bottomLeft.elev < elev) { lower = true }
    if (bottomRight.elev === elev) { res.push([bottomRight.lon, bottomRight.lat]) } else if (!lower && bottomRight.elev < elev) { lower = true }

    if (lower) {
      return res
    } else { return null }
  } else {
    let possibleLine = elevWithin(topLeft, topRight, elev, 'lon')
    if (Array.isArray(possibleLine)) { res.push(possibleLine) }

    possibleLine = elevWithin(topRight, bottomRight, elev, 'lat')
    if (Array.isArray(possibleLine)) { res.push(possibleLine) }

    possibleLine = elevWithin(bottomRight, bottomLeft, elev, 'lon')
    if (Array.isArray(possibleLine)) { res.push(possibleLine) }

    possibleLine = elevWithin(bottomLeft, topLeft, elev, 'lat')
    if (Array.isArray(possibleLine)) { res.push(possibleLine) }

    if (res.length > 2) { removeDuplicates(res) }

    if (res.length !== 2) { return null } else if (res[0][0] === res[1][0] && res[0][1] === res[1][1]) { return null } else { return res }
  }
}

function elevWithin (pointA: Point, pointB: Point, elev: number, changeParam: 'lat' | 'lon'): bool | Array<number> {
  if (pointA.elev === pointB.elev) {
    return false
  } else if (pointA.elev === elev) {
    return [pointA.lon, pointA.lat]
  } else if (pointB.elev === elev) {
    return [pointB.lon, pointB.lat]
  } else if ((elev < pointA.elev && elev > pointB.elev) || (elev > pointA.elev && elev < pointB.elev)) {
    // y = mx + b     ;       x = (chngX / chngZ)*Z + x-intercept
    if (changeParam === 'lon') {
      let slope = ((pointA.lon - pointB.lon) / (pointA.elev - pointB.elev))
      let x = slope * elev + (pointA.lon - (slope * pointA.elev))
      return [x, pointA.lat]
    } else { // 'lat'
      let slope = ((pointA.lat - pointB.lat) / (pointA.elev - pointB.elev))
      let y = slope * elev + (pointA.lat - (slope * pointA.elev))
      return [pointA.lon, y]
    }
  } else {
    return false
  }
}

function removeDuplicates (arr) {
  for (let j = 0; j < arr.length; j++) {
    for (let i = 1; i < arr.length; i++) {
      if (i !== j && arr[i][0] === arr[j][0] && arr[i][1] === arr[j][1]) {
        arr.splice(i, 1)
        i--
      }
    }
  }
}
