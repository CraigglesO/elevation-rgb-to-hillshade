// @flow
// NOTE: turf-bezier-spline is incredibly slow and actually bad at high zooms
// const turf = require('@turf/turf'); // https://github.com/Turfjs/turf/tree/master/packages/turf-bezier-spline

type Feature = {
  type: string,
  geometry: { type: string, coordinates: Array<Array<number>> },
  properties: { [key: string]: string | number | bool },
  tippecanoe: { [key: string]: string | number | bool }
}

export type FeatureCollection = {
  type: string,
  features: Array<Feature>
}

export type SmoothOptions = {
  resolution: number,
  sharpness: number
}

export default function smooth (featurecollection: FeatureCollection, options?: SmoothOptions): FeatureCollection {
  for (let i = 0; i < featurecollection.features.length; i++) { featurecollection.features[i] = smoothLine(featurecollection.features[i], options) }
  return featurecollection
}

function smoothLine (feature: Feature, options?: SmoothOptions = {}) {
  let coordLength = feature.geometry.coordinates.length // get length
  let newCoords = [feature.geometry.coordinates[0]] // start with the first point
  let prevCoord, currCoord, nextCoord, nextNextCoord // prep variables
  prevCoord = feature.geometry.coordinates[0] // prep previous
  for (let i = 1; i < coordLength - 2; i++) { // start looking at the point after the first and make sure to stop one before the end
    currCoord = feature.geometry.coordinates[i]
    nextCoord = feature.geometry.coordinates[i + 1]
    nextNextCoord = feature.geometry.coordinates[i + 2]
    if (staircase([prevCoord, nextNextCoord], currCoord, nextCoord)) { // its a staircase, so just remove the middlePoint; (if startCoord and nextNextCoord make a line, and the first and second coord fall on opposite ends, we drop them add move straight to the next line)
      newCoords.push(nextNextCoord)
      // TODO: the if statement needs a maximum length between prevCoord and nextNextCoord
      i++ // move up to nextCoord and then the for loop will move up again yo nextNextCoord at the end...
      // NOTE: prevCoord doesn't change here because we removed the curr and next
    } else { // find the middle point between the two:
      newCoords.push([(currCoord[0] + nextCoord[0]) / 2, (currCoord[1] + nextCoord[1]) / 2])
      prevCoord = currCoord
    }
  }
  // now add the last one
  newCoords.push(feature.geometry.coordinates[coordLength - 1])
  // set new cords to feature
  feature.geometry.coordinates = newCoords
  return feature
}

// A staircase is when a line zig-zags back and forth. Very unnatractive and a small problem with this algo.
function staircase (line: Array<Array<number>>, p1: Array<number>, p2: Array<number>) { // https://math.stackexchange.com/questions/162728/how-to-determine-if-2-points-are-on-opposite-sides-of-a-line
  let difference = ((line[0][1] - line[1][1]) * (p1[0] - line[0][0]) + (line[1][0] - line[0][0]) * (p1[1] - line[0][1])) *
                  ((line[0][1] - line[1][1]) * (p2[0] - line[0][0]) + (line[1][0] - line[0][0]) * (p2[1] - line[0][1]))

  if (difference < 0) { return true }
  return false
}
