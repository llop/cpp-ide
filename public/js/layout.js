var outerLayout,
    debugLayout;

$(function() {
  var outerLayoutOpts = {
    name: "outerLayout",
    defaults: {
      spacing_open:4,
      spacing_closed:4,
      closable:false
    },
    north: {
      closable:false,
      resizable:false,
      slidable:false,
      spacing_open:0,
      spacing_closed:0
    },
    south: {
      
    },
    east: {
      size:'40%',
      resizerCursor:'col-resize',
      sliderCursor:'col-resize'
    },
    west: {
      size:'20%',
      resizerCursor:'col-resize',
      sliderCursor:'col-resize'
    }
  };
  outerLayout = $("body").layout(outerLayoutOpts);
  
  var debugLayoutOpts = {
    name: "debugLayout",
    defaults: {
      spacing_open:4,
      spacing_closed:4,
      closable:false
    },
    north: {
      closable:false,
      resizable:false,
      slidable:false,
      spacing_open:0,
      spacing_closed:0
    },
    south: {
      size:'50%',
      resizerCursor:'row-resize',
      sliderCursor:'row-resize'
    },
    east: {
      
    },
    west: {
      
    }
  };
  debugLayout = $("#debug-layout").layout(debugLayoutOpts);
});
