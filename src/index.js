import fs from 'fs'
import ElevationContainer from './elevationContainer'
import glob from 'glob'

export { default as ElevationContainer } from './elevationContainer'

// TODO: add bin file
// TODO: Readme

export type Elevations = Array<Array<number>> // [[x, y, z]]

export type Options = {
  overwrite?: bool,
  smooth?: bool,
  verbose?: bool,
  size?: number,
  units?: string, // meters & feet
  inputFolder?: string,
  outputFolder?: string,
  tippecanoeLayer?: string,
  threads?: number,
  child?: bool
}

export function elevationToContour (elevations: Elevations | string, options?: Options = {}) {
  // create errorHandler if it does not exist
  if (!options.errorHandler) { options.errorHandler = () => {} }
  // setup outputFolder
  if (!options.outputFolder) { options.outputFolder = './out' }
  if (!fs.existsSync(options.outputFolder)) {
    try {
      fs.mkdirSync(options.outputFolder)
    } catch (error) { options.errorHandler(error) }
  }
  // find all elevations if the input is a path and not an array of elevations already
  if (typeof elevations === 'string') { [elevations, options] = elevationsPathToArray(elevations, options) }

  createContours(elevations, options)
}

export function elevationsPathToArray (elevations: string, options: Options) {
  if (fs.existsSync(elevations) && fs.lstatSync(elevations).isDirectory()) {
    options.inputFolder = elevations
    // run through the dir and all sub dir and find all files that are .png
    let files = glob.sync(`${elevations}/**/*.png`)
    elevations = files.map(file => { // create options.inputFolder and [x, y, z] list
      let foldersFile = file.split('/')
      let y = parseInt(foldersFile.pop().split('.')[0]) // remove the '.png' from zoom
      let x = parseInt(foldersFile.pop())
      let z = parseInt(foldersFile.pop())
      return [x, y, z]
    })
  } else {
    return options.errorHandler(new Error('directory not found'))
  }
  return [elevations, options]
}

export function createContours (elevations: Elevations, options: Options) {
  if (!elevations.length) {
    if (options.child) {
      process.send({ done: true })
      process.exit()
    }
    return
  }
  let elevation = elevations.pop()
  // move on if the file already exists and we are not overwriting
  if (fs.existsSync(`${options.outputFolder}/${elevation[2]}/${elevation[0]}/${elevation[1]}.geojson`) && options.overwrite === false) {
    process.send({ finishedOne: true })
    return createContours(elevations, options)
  }
  const elevationContainer = new ElevationContainer(elevation[0], elevation[1], elevation[2], options)

  elevationContainer.createElevationMatrix()
    .then(() => {
      // first create lines
      elevationContainer.createContourLines(options.getStepSize)
      // conjoin the lines:
      elevationContainer.contoursToMultiLineStrings()
      // then save as a FeatureCollection => outFolder/z/x/y.geojson
      if (!fs.existsSync(`${options.outputFolder}/${elevation[2]}`)) fs.mkdirSync(`${options.outputFolder}/${elevation[2]}`)
      if (!fs.existsSync(`${options.outputFolder}/${elevation[2]}/${elevation[0]}`)) fs.mkdirSync(`${options.outputFolder}/${elevation[2]}/${elevation[0]}`)
      elevationContainer.saveFeatureCollection(
        `${options.outputFolder}/${elevation[2]}/${elevation[0]}/${elevation[1]}.geojson`,
        options.getIndex,
        options.tippecanoeLayer
      )
      // run the createContours until we exhaust list
      process.send({ finishedOne: true })
      return createContours(elevations, options)
    })
    .catch(error => {
      options.errorHandler(error)
      // run the createContours until we exhaust list
      process.send({ finishedOne: true })
      return createContours(elevations, options)
    })
}
