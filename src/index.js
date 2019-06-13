import ElevationContainer from './elevationContainer'
import fs from 'fs'
import glob from 'glob'

export { default as ElevationContainer } from './elevationContainer'

// TODO: add bin file
// TODO: multi-core-support
// TODO: Readme

export type Elevations = Array<Array<number>> // [[x, y, z]]

export type Options = {
  overwrite?: bool,
  smooth?: bool,
  verbose?: bool,
  inputFolder?: string,
  outputFolder?: string,
  tippecanoeLayer?: string
}

export function elevationToContour (elevations: Elevations | string, options?: Options = {}) {
  const outputFolder = (options.outputFolder) ? options.outputFolder : './out'
  // create the outFolder if it does not exist
  if (!fs.existsSync(outputFolder)) {
    try {
      fs.mkdirSync(outputFolder)
    } catch (error) { options.errorHandler(error) }
  }
  if (typeof elevations === 'string') {
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
      return options.errorHander(new Error('directory not found'))
    }
  }

  function createContours (elevations: Elevations) {
    if (!elevations.length) return
    let elevation = elevations.pop()
    // move on if the file already exists and we are not overwriting
    if (fs.existsSync(`${outputFolder}/${elevation[2]}/${elevation[0]}/${elevation[1]}.geojson`) && options.overwrite === false) return createContours(elevations)
    const elevationContainer = new ElevationContainer(elevation[0], elevation[1], elevation[2], 512, options.inputFolder, options.verbose)

    elevationContainer.createElevationMatrix()
      .then(() => {
        // first create lines
        elevationContainer.createContourLines(options.getStepSize)
        // conjoin the lines:
        elevationContainer.contoursToMultiLineStrings()
        // then save as a FeatureCollection => outFolder/z/x/y.geojson
        if (!fs.existsSync(`${outputFolder}/${elevation[2]}`)) fs.mkdirSync(`${outputFolder}/${elevation[2]}`)
        if (!fs.existsSync(`${outputFolder}/${elevation[2]}/${elevation[0]}`)) fs.mkdirSync(`${outputFolder}/${elevation[2]}/${elevation[0]}`)
        elevationContainer.saveFeatureCollection(
          `${outputFolder}/${elevation[2]}/${elevation[0]}/${elevation[1]}.geojson`,
          options.getIndex,
          options.tippecanoeLayer
        )
        // run the createContours until we exhaust list
        return createContours(elevations)
      })
      .catch(error => {
        if (options.errorHandler) options.errorHandler(error)
        // run the createContours until we exhaust list
        return createContours(elevations)
      })
  }

  createContours(elevations)
}
