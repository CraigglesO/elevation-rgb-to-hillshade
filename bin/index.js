const fs = require('fs')
const { fork } = require('child_process')

const { elevationsPathToArray, createContours } = require('../lib')
const log = require('single-line-log').stdout
const commandLineArgs = require('command-line-args')

const optionDefinitions = [
  { name: 'verbose', alias: 'v', type: Boolean },
  { name: 'input', alias: 'i', type: String },
  { name: 'output', alias: 'o', type: Number },
  { name: 'size', alias: 's', type: Number },
  { name: 'units', alias: 'u', type: String },
  { name: 'overwrite', alias: 'w', type: Boolean },
  { name: 'smooth', type: Boolean },
  { name: 'tippecanoeLayer', alias: 'l', type: String },
  { name: 'threads', alias: 't', type: Number },
  { name: 'child', alias: 'c', type: Number }
]

let options = commandLineArgs(optionDefinitions)
if (!options.overwrite) options.overwrite = false
if (!options.verbose) options.verbose = false

if (options.child) {
  process.on('message', msg => {
    msg.options.child = true
    if (msg.elevations) createContours(msg.elevations, msg.options)
  })
  process.send({ ready: true, child: options.child })
} else {
  // create errorHandler if it does not exist
  if (!options.errorHandler) { options.errorHandler = () => {} }
  // setup input and outputFolder
  if (!options.input) options.inputFolder = './hillshades'
  if (options.output) options.outputFolder = options.output
  if (!options.outputFolder) { options.outputFolder = './out' }
  if (!fs.existsSync(options.outputFolder)) {
    try {
      fs.mkdirSync(options.outputFolder)
    } catch (error) { options.errorHandler(error) }
  }
  // find all elevations if the input is a path and not an array of elevations already
  let completed = 0
  let elevations, total
  [elevations, options] = elevationsPathToArray(options.inputFolder, options)
  total = elevations.length
  // if we don't have a thread count, just set it to 1
  if (!options.threads) { options.threads = 1 }

  if (options.threads > 1) {
    // first split the elevations workload
    let elevationsSplit = splitUp(elevations, options.threads)
    console.log('split', elevationsSplit)
    for (let i = 0; i < options.threads; i++) {
      const forked = fork(`${process.argv[1]}`, ['--child', i])
      forked.on('message', msg => {
        if (msg.ready) forked.send({ elevations: elevationsSplit[msg.child], options }) // send the workload
        if (msg.finishedOne) {
          completed++
          if (!options.verbose) { log(`${completed}/${total}`) }
        }
        if (msg.done) {} // weird ass bug
      })
    }
  } else { // otherwise just run through the elevations
    createContours(elevations, options)
  }
}

function splitUp (arr, n) {
  let res = []
  for (let j = 0; j < n; j++) { res.push([]) }
  let j = 0
  for (let i = 0, al = arr.length; i < al; i++) {
    res[j].push(arr[i])
    j++
    if (j >= n) j = 0
  }
  return res
}
