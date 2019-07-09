const { elevationToContour } = require('./lib')

elevationToContour('./hillshades', {
  errorHandler: (error) => {
    console.log('ERROR', error)
  },
  overwrite: false,
  verbose: true,
  tippecanoeLayer: 'regiaShades'
})

// elevationToContour([[3106, 6166, 14]], {
//   errorHandler: (error) => {
//     console.log('ERROR', error)
//   }
//   // overwrite: false
// })

// let elevations = [[3104, 6163, 14], [3104, 6164, 14], [3104, 6165, 14], [3103, 6164, 14], [3105, 6164, 14], [3103, 6163, 14], [3103, 6165, 14], [3105, 6163, 14], [3105, 6165, 14]]
// let elevations = [[3103, 6163, 14]]

// fileLocation ./hillshades/14/3105/6165.png
// fileLocation ./hillshades/14/3105/6165.png
