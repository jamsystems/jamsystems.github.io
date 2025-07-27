// globals
let data = [];
let longTermAverageVix = 0;
let longTermAverageRealizedVol = 0;
let currentBrushSelection = [[0, 0], [1, 1]]; // Store brush selection as normalized coordinates
let currentScene = 1;
let timeAnimationInterval = null;
let vixAnimationInterval = null;
let timeAnimationStep = 0;
let vixAnimationStep = 0;
let isTimeAnimationPlaying = false;
let isVixAnimationPlaying = false;

// misc calcs
function calculateAverageVix(dataset) {
    let validData = dataset.filter(d => !isNaN(d.vixClose));
    if (validData.length === 0) return 0;
    return validData.reduce((sum, d) => sum + d.vixClose, 0) / validData.length;
}

function calculateAverageRealizedVol(dataset) {
    let validData = dataset.filter(d => !isNaN(d.targetRealizedVol20d));
    if (validData.length === 0) return 0;
    return validData.reduce((sum, d) => sum + d.targetRealizedVol20d, 0) / validData.length;
}

function calculateSkewness(values) {
    if (values.length < 3) return 0;
    
    let n = values.length;
    let mean = values.reduce((sum, val) => sum + val, 0) / n;
    
    let m2 = 0, m3 = 0;
    for (let i = 0; i < n; i++) {
        let diff = values[i] - mean;
        m2 += diff * diff;
        m3 += diff * diff * diff;
    }
    
    m2 /= n;
    m3 /= n;
    
    if (m2 === 0) return 0;
    
    let skewness = m3 / Math.pow(m2, 1.5);
    return skewness;
}

function calculateKurtosis(values) {
    if (values.length < 4) return 3;
    
    let n = values.length;
    let mean = values.reduce((sum, val) => sum + val, 0) / n;
    
    let m2 = 0, m4 = 0;
    for (let i = 0; i < n; i++) {
        let diff = values[i] - mean;
        let diff2 = diff * diff;
        m2 += diff2;
        m4 += diff2 * diff2;
    }
    
    m2 /= n;
    m4 /= n;
    
    if (m2 === 0) return 3;
    
    let kurtosis = m4 / (m2 * m2);
    return kurtosis; // normal = 3
}

// chart stuff
function createSecondaryScale(height) {
    return d3.scaleLinear()
        .domain([0, 1.0]) // hardcode vol to be 0-100%
        .range([height, 0]);
}

// annotations
function addVixAnnotations(g, xScale, yScaleSecondary) {

    let crisis2008 = data.find(d => d.date.getFullYear() === 2008 && d.date.getMonth() === 10 && d.date.getDate() === 20); // 11/20/2008
    
    let covid2020 = data.find(d => d.date.getFullYear() === 2020 && d.date.getMonth() === 2 && d.date.getDate() ===16); // 3-16-2020

    
    // 2008 annotation
    if (crisis2008.date) {
        let crisisGroup = g.append("g")
            .attr("class", "vix-annotation crisis-2008")
            .style("display", "none")
            .style("opacity", 0);
        
        let crisisX = xScale(crisis2008.date);
        let crisisY = yScaleSecondary(crisis2008.vixClose / 100);
        
        crisisGroup.append("line")
            .attr("x1", crisisX)
            .attr("y1", crisisY)
            .attr("x2", crisisX)
            .attr("y2", crisisY - 40)
            .style("stroke", "black")
            .style("stroke-width", 2)
            .style("stroke-dasharray", "3,3");
        
        crisisGroup.append("text")
            .attr("x", crisisX)
            .attr("y", crisisY - 47)
            .text("Financial Crisis - 80.9%");
            
    }
    
    // COVID annotation
    if (covid2020.date) {
        let covidGroup = g.append("g")
            .attr("class", "vix-annotation covid-2020")
            .style("display", "none")
            .style("opacity", 0);
        
        let covidX = xScale(covid2020.date);
        let covidY = yScaleSecondary(covid2020.vixClose / 100);
        
        covidGroup.append("line")
            .attr("x1", covidX)
            .attr("y1", covidY)
            .attr("x2", covidX)
            .attr("y2", covidY - 40)
            .style("stroke-width", 2)
            .style("stroke", "black")
            .style("stroke-dasharray", "3,3");
    
    
        covidGroup.append("text")
            .attr("x", covidX)
            .attr("y", covidY - 47)
            .text("COVID - 82.7%");
            
    }
}

// annotation visibility
function updateAnnotationVisibility(xScale, yScaleSecondary, x0, y0, x1, y1) {
    let date0 = xScale.invert(x0);
    let date1 = xScale.invert(x1);
    let vix0 = yScaleSecondary.invert(y1) * 100;
    let vix1 = yScaleSecondary.invert(y0) * 100;
    
    // annotations in view?
    let annotations = d3.selectAll(".vix-annotation");
    
    annotations.each(function() {
        let annotation = d3.select(this);
        
        if (annotation.classed("crisis-2008")) {
            let crisis2008date = new Date(2008, 10, 20);

            if (crisis2008date >= date0 && crisis2008date <= date1 && 
                80.9 >= vix0 && 80.9 <= vix1) {
                annotation.transition().duration(400).style("opacity", 1).style("display", "block");
            } else {
                annotation.transition().duration(400).style("opacity", 0).on("end", function() { d3.select(this).style("display", "none"); });
            }
        } else if (annotation.classed("covid-2020")) {

            let covid2020date = new Date(2020, 2, 16);
            
            if (covid2020date >= date0 && covid2020date <= date1 && 
                82.7 >= vix0 && 82.7 <= vix1) {
                annotation.transition().duration(400).style("opacity", 1).style("display", "block");
            } else {
                annotation.transition().duration(400).style("opacity", 0).on("end", function() { d3.select(this).style("display", "none"); });
            }
        }
    });
}

// main chart
function createSharedChart() {
    let svg = d3.select("#shared-chart");
    svg.selectAll("*").remove();
    
    let margin = {top: 20, right: 150, bottom: 60, left: 80};
    let width = 1000 - margin.left - margin.right;
    let height = 500 - margin.top - margin.bottom;
    
    let g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);
    
    let xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.date))
        .range([0, width]);
    
    let yScalePrice = d3.scaleLinear()
        .domain(d3.extent(data, d => d.spyClose))
        .range([height, 0]);
    
    let yScaleSecondary = createSecondaryScale(height);
    
    //  axes
    g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat("%Y")));
    
    g.append("g")
        .call(d3.axisLeft(yScalePrice));
    
    g.append("g")
        .attr("transform", `translate(${width},0)`)
        .call(d3.axisRight(yScaleSecondary).tickFormat(d3.format(".1%")));
    
    // axis labels
    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("fill", "#007bff")
        .text("SPY Price");
    
    g.append("text")
        .attr("class", "secondary-axis-label")
        .attr("transform", "rotate(-90)")
        .attr("y", width + margin.right - 80)
        .attr("x", 0 - (height / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("fill", "#28a745")
        .text("VIX Index");
    
    g.append("text")
        .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
        .style("text-anchor", "middle")
        .text("Year");
    
    let priceLine = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScalePrice(d.spyClose))
        .curve(d3.curveMonotoneX);
    
    g.append("path")
        .datum(data)
        .attr("d", priceLine)
        .style("stroke", "#007bff")
        .style("fill", "none")
        .style("stroke-width", 2);
    
    // VIX 
    let vixLine = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScaleSecondary(d.vixClose / 100))
        .curve(d3.curveMonotoneX);
    
    g.append("path")
        .attr("class", "vix-line")
        .datum(data)
        .attr("d", vixLine)
        .style("stroke", "#28a745")
        .style("fill", "none")
        .style("stroke-width", 2)
        .style("opacity", 0.8);
    
    // annotations 
    addVixAnnotations(g, xScale, yScaleSecondary);
    
    //  brush (only scene 3)
    let brush = d3.brush()
        .extent([[0, 0], [width, height]])
        .on("end", function(event) {
            if (currentScene !== 3) return;
            
            if (!event.selection) {
                currentBrushSelection = [[0, 0], [1, 1]];
                updateDataForCurrentScene(xScale, yScaleSecondary, 0, 0, width, height);
                return;
            }
            
            let [[x0, y0], [x1, y1]] = event.selection;
            
            // update location
            currentBrushSelection = [
                [x0 / width, y0 / height],
                [x1 / width, y1 / height]
            ];
            
            // filter
            updateDataForCurrentScene(xScale, yScaleSecondary, x0, y0, x1, y1);
        });
    
    g.append("g")
        .attr("class", "brush")
        .call(brush)
        .call(brush.move, [
            [currentBrushSelection[0][0] * width, currentBrushSelection[0][1] * height],
            [currentBrushSelection[1][0] * width, currentBrushSelection[1][1] * height]
        ])
        .style("pointer-events", "none"); // disabled for starters
    
    // hang on to scales...
    window.chartScales = { xScale, yScaleSecondary, width, height };
}

// scene updates
function updateChartForScene(sceneNum) {
    let svg = d3.select("#shared-chart");
    let brush = svg.select(".brush");
    let brushSelection = svg.select(".brush .selection");
    let brushHandles = svg.selectAll(".brush .handle");
    let brushOverlay = svg.select(".brush .overlay");
    
    if (sceneNum === 3) {
        // eable brush
        brush.style("pointer-events", "all").style("opacity", 1);
        brushSelection.style("display", "block");
        brushHandles.style("display", "block");
        brushOverlay.style("cursor", "crosshair");
    } else {
        // scene1 & 2: display but disable brush
        brush.style("pointer-events", "none").style("opacity", 1);
        brushSelection.style("display", "block");
        brushHandles.style("display", "none"); // hide resize handles
        brushOverlay.style("cursor", "default"); // normal cursor
        
        // always reset
        if (window.chartScales) {
            let {width, height} = window.chartScales;
            currentBrushSelection = [[0, 0], [1, 1]];
            
            // reset animation
            timeAnimationStep = 0;
            vixAnimationStep = 0;
            
            // labels
            if (sceneNum === 1) {
                d3.select("#time-period-label").text("Time Period: Full Dataset");
            } else if (sceneNum === 2) {
                d3.select("#vix-level-label").text("VIX Range: Full Dataset");
            }
            
            // update for full dataset
            setTimeout(() => {
                let {xScale, yScaleSecondary} = window.chartScales;
                updateAnnotationVisibility(xScale, yScaleSecondary, 0, 0, width, height);
                updateStats(data);
                updateDistributionChart(data);
            }, 100);
        }
    }
}

// animation funcs
function stopAnimations() {
    if (timeAnimationInterval) {
        clearInterval(timeAnimationInterval);
        timeAnimationInterval = null;
    }
    if (vixAnimationInterval) {
        clearInterval(vixAnimationInterval);
        vixAnimationInterval = null;
    }
    isTimeAnimationPlaying = false;
    isVixAnimationPlaying = false;
    updateAnimationButtons();
}

function updateAnimationButtons() {
    if (currentScene === 1) {
        let playBtn = d3.select("#play-time-btn");
        let pauseBtn = d3.select("#pause-time-btn");
        if (isTimeAnimationPlaying) {
            playBtn.text("Playing...").property("disabled", true);
            pauseBtn.property("disabled", false);
        } else {
            playBtn.text("Play Animation").property("disabled", false);
            pauseBtn.property("disabled", true);
        }
    } else if (currentScene === 2) {
        let playBtn = d3.select("#play-vix-btn");
        let pauseBtn = d3.select("#pause-vix-btn");
        if (isVixAnimationPlaying) {
            playBtn.text("Playing...").property("disabled", true);
            pauseBtn.property("disabled", false);
        } else {
            playBtn.text("Play Animation").property("disabled", false);
            pauseBtn.property("disabled", true);
        }
    }
}

function setupAnimations(sceneNum) {
    if (sceneNum === 1) {
        d3.select("#play-time-btn").on("click", startTimeAnimation);
        d3.select("#pause-time-btn").on("click", () => {
            clearInterval(timeAnimationInterval);
            timeAnimationInterval = null;
            isTimeAnimationPlaying = false;
            updateAnimationButtons();
        });
        d3.select("#reset-time-btn").on("click", () => {
            stopAnimations();
            timeAnimationStep = 0;
            resetToFullData();
            d3.select("#time-period-label").text("Time Period: Full Dataset");
        });
    } else if (sceneNum === 2) {
        d3.select("#play-vix-btn").on("click", startVixAnimation);
        d3.select("#pause-vix-btn").on("click", () => {
            clearInterval(vixAnimationInterval);
            vixAnimationInterval = null;
            isVixAnimationPlaying = false;
            updateAnimationButtons();
        });
        d3.select("#reset-vix-btn").on("click", () => {
            stopAnimations();
            vixAnimationStep = 0;
            resetToFullData();
            d3.select("#vix-level-label").text("VIX Range: Full Dataset");
        });
    }
    updateAnimationButtons();
}

// scene navigation 
function showScene(sceneNum) {
    stopAnimations();
    currentScene = sceneNum;
    
    // ui updates
    d3.selectAll('.scene').classed('active', false);
    d3.selectAll('.nav-button').classed('active', false);
    d3.select(`#scene${sceneNum}`).classed('active', true);
    d3.selectAll('.nav-button').filter((d, i) => i === sceneNum - 1).classed('active', true);
    
    // shared chart setup
    let activeScene = d3.select(`#scene${sceneNum} .chart-container`);
    let sharedChart = d3.select("#shared-chart");
    if (!activeScene.select("#shared-chart").empty() === false) {
        activeScene.node().appendChild(sharedChart.node());
    }
    
    updateChartForScene(sceneNum);
    setupAnimations(sceneNum);
    
    // update data
    if (window.chartScales) {
        let {xScale, yScaleSecondary, width, height} = window.chartScales;
        let x0 = currentBrushSelection[0][0] * width;
        let y0 = currentBrushSelection[0][1] * height;
        let x1 = currentBrushSelection[1][0] * width;
        let y1 = currentBrushSelection[1][1] * height;
        updateDataForCurrentScene(xScale, yScaleSecondary, x0, y0, x1, y1);
    }
}

// update filtering  - for all scenes now...
function updateDataForCurrentScene(xScale, yScaleSecondary, x0, y0, x1, y1) {
    let date0 = xScale.invert(x0);
    let date1 = xScale.invert(x1);
    let vix0 = yScaleSecondary.invert(y1) * 100;
    let vix1 = yScaleSecondary.invert(y0) * 100;
    
    let selectedData = data.filter(d => 
        d.date >= date0 && d.date <= date1 &&
        d.vixClose >= vix0 && d.vixClose <= vix1
    );
    
    updateAnnotationVisibility(xScale, yScaleSecondary, x0, y0, x1, y1);
    updateStats(selectedData);
    updateDistributionChart(selectedData);
}

// stats updates (for all scenes now too!))
function updateStats(dataset) {
    let avgVix = calculateAverageVix(dataset);
    let statsId = `#avg-vol${currentScene === 1 ? '' : currentScene}`;
    
    if (dataset.length === 0) {
        // d3.select(statsId).html(`<strong>No data selected</strong><br/><small style="color: #666;">Adjust selection area</small>`);
        return;
    }
    
    let returns = dataset.map(d => d.spyReturn).filter(r => !isNaN(r));
    let skew = calculateSkewness(returns);
    let kurtosis = calculateKurtosis(returns);
    let allReturns = data.map(d => d.spyReturn).filter(r => !isNaN(r));
    let fullSkew = calculateSkewness(allReturns);
    let fullKurtosis = calculateKurtosis(allReturns);
    
    d3.select(statsId).html(`
        <strong>Average VIX: ${avgVix.toFixed(2)}</strong><br/>
        <small style="color: #666;">
            <strong>Selected Data (n=${returns.length}):</strong> Skew = ${skew.toFixed(3)}, Kurtosis = ${kurtosis.toFixed(3)}<br/>
            <strong>Full Dataset (n=${allReturns.length}):</strong> Skew = ${fullSkew.toFixed(3)}, Kurtosis = ${fullKurtosis.toFixed(3)}<br/>
            <strong>Normal Distribution Theory:</strong> Skew = 0.000, Kurtosis = 3.000
        </small>
    `);
}

// distribution chart update (works for all scenes)
function updateDistributionChart(selectedData) {
    let chartId = `#distribution-chart${currentScene === 1 ? '' : currentScene}`;
    let avgVix = calculateAverageVix(selectedData);
    let avgRealizedVol = calculateAverageRealizedVol(selectedData);
    createDistributionChartWithHistogram(avgRealizedVol, longTermAverageRealizedVol, selectedData, chartId);
}

// animations
function startTimeAnimation() {
    if (timeAnimationInterval || isTimeAnimationPlaying) return;
    // resetToFullData();
    isTimeAnimationPlaying = true;
    updateAnimationButtons();
    
    let dateExtent = d3.extent(data, d => d.date);
    let totalYears = (dateExtent[1] - dateExtent[0]) / (365.25 * 24 * 60 * 60 * 1000);
    let steps = Math.ceil(totalYears / 2);
    
    timeAnimationInterval = setInterval(() => {
        if (timeAnimationStep >= steps) {
            stopAnimations();
            return;
        }
        
        let yearDuration = 2 * 365.25 * 24 * 60 * 60 * 1000;
        let startDate = new Date(dateExtent[0].getTime() + timeAnimationStep * yearDuration);
        let endDate = new Date(Math.min(startDate.getTime() + yearDuration, dateExtent[1].getTime()));
        
        animateBrushToTimeRange(startDate, endDate);
        d3.select("#time-period-label").text(`Time Period: ${startDate.getFullYear()} - ${endDate.getFullYear()}`);
        timeAnimationStep++;
    }, 1000); // 2 second per step
}

function startVixAnimation() {
    if (vixAnimationInterval || isVixAnimationPlaying) return;
    
    isVixAnimationPlaying = true;
    updateAnimationButtons();
    
    let sortedByVix = [...data].sort((a, b) => a.vixClose - b.vixClose);
    let chunkSize = Math.floor(sortedByVix.length / 10);
    
    vixAnimationInterval = setInterval(() => {
        if (vixAnimationStep >= 10) {
            stopAnimations();
            return;
        }
        
        let startIdx = vixAnimationStep * chunkSize;
        let endIdx = vixAnimationStep === 9 ? sortedByVix.length : (vixAnimationStep + 1) * chunkSize;
        let chunk = sortedByVix.slice(startIdx, endIdx);
        let vixMin = d3.min(chunk, d => d.vixClose);
        let vixMax = d3.max(chunk, d => d.vixClose);
        
        animateBrushToVixRange(vixMin, vixMax);
        d3.select("#vix-level-label").text(`VIX Range: ${vixMin.toFixed(1)} - ${vixMax.toFixed(1)} (${((vixAnimationStep + 1) * 10)}% of data)`);
        vixAnimationStep++;
    }, 1000);
}

function animateBrushToTimeRange(startDate, endDate) {
    if (!window.chartScales) return;
    let {xScale, yScaleSecondary, width, height} = window.chartScales;
    let x0 = xScale(startDate), x1 = xScale(endDate), y0 = 0, y1 = height;
    
    d3.select("#shared-chart").select(".brush")
        .transition().duration(800).ease(d3.easeQuadInOut)
        .call(d3.brush().move, [[x0, y0], [x1, y1]]);
    
    currentBrushSelection = [[x0 / width, y0 / height], [x1 / width, y1 / height]];
    setTimeout(() => updateDataForCurrentScene(xScale, yScaleSecondary, x0, y0, x1, y1), 100);
}

function animateBrushToVixRange(vixMin, vixMax) {
    if (!window.chartScales) return;
    let {xScale, yScaleSecondary, width, height} = window.chartScales;
    let x0 = 0, x1 = width;
    let y0 = yScaleSecondary(vixMax / 100), y1 = yScaleSecondary(vixMin / 100);
    
    d3.select("#shared-chart").select(".brush")
        .transition().duration(800).ease(d3.easeQuadInOut)
        .call(d3.brush().move, [[x0, y0], [x1, y1]]);
    
    currentBrushSelection = [[x0 / width, y0 / height], [x1 / width, y1 / height]];
    setTimeout(() => updateDataForCurrentScene(xScale, yScaleSecondary, x0, y0, x1, y1), 100);
}

function resetToFullData() {
    if (!window.chartScales) return;
    let {width, height, xScale, yScaleSecondary} = window.chartScales;
    currentBrushSelection = [[0, 0], [1, 1]];
    
    d3.select("#shared-chart").select(".brush")
        .transition().duration(500).call(d3.brush().move, [[0, 0], [width, height]]);
    
    updateAnnotationVisibility(xScale, yScaleSecondary, 0, 0, width, height);
    updateStats(data);
    updateDistributionChart(data);
    
    // reset scene labels
    if (currentScene === 1) {
        d3.select("#time-period-label").text("Time Period: Full Dataset");
    } else if (currentScene === 2) {
        d3.select("#vix-level-label").text("VIX Range: Full Dataset");
    }
}

// Initialize distributions 
function initializeDistributionCharts() {
    updateStats(data);
    updateDistributionChart(data);

    createDistributionChartWithHistogram(longTermAverageRealizedVol, longTermAverageRealizedVol, data, "#distribution-chart2");
    createDistributionChartWithHistogram(longTermAverageRealizedVol, longTermAverageRealizedVol, data, "#distribution-chart3");
}

// animated histogram (used by all scenes now too!)
function createDistributionChartWithHistogram(avgRealizedVol, longTermRealizedVol, selectedData, chartId) {
    let svg = d3.select(chartId);
    let margin = {top: 20, right: 80, bottom: 60, left: 80};
    let width = 1000 - margin.left - margin.right;
    let height = 400 - margin.top - margin.bottom;
    
    // setup if it doesn't exist - todo - fix might be here for null selection issue (where histogram never comes back)
    let g = svg.select("g.chart-group");
    if (g.empty()) {
        svg.selectAll("*").remove();
        g = svg.append("g")
            .attr("class", "chart-group")
            .attr("transform", `translate(${margin.left},${margin.top})`);
        
        g.append("g")
            .attr("class", "x-axis")
            .attr("transform", `translate(0,${height})`);
            
        g.append("text")
            .attr("class", "x-label")
            .attr("transform", `translate(${width / 2}, ${height + margin.bottom - 10})`)
            .style("text-anchor", "middle")
            .text("Daily Return");
            
        g.append("g").attr("class", "histogram-bars");
        g.append("g").attr("class", "distribution-lines");
        g.append("g").attr("class", "legend-group")
            .attr("transform", `translate(${width - 220}, 20)`);
    }
    
    // normal distribution curves
    let returns = d3.range(-0.10, 0.10, 0.001);
    let selectedDistribution = returns.map(r => ({
        x: r,
        y: Math.exp(-0.5 * Math.pow(r / avgRealizedVol, 2)) / (avgRealizedVol * Math.sqrt(2 * Math.PI))
    }));
    
    let longTermDistribution = returns.map(r => ({
        x: r,
        y: Math.exp(-0.5 * Math.pow(r / longTermRealizedVol, 2)) / (longTermRealizedVol * Math.sqrt(2 * Math.PI))
    }));
    
    //  histogram
    let returnValues = selectedData.map(d => d.spyReturn);
    let bins = d3.bin().domain([-0.10, 0.10]).thresholds(40)(returnValues);
    let binWidth = bins.length > 0 ? bins[0].x1 - bins[0].x0 : 0.005;
    
    let xScale = d3.scaleLinear().domain([-0.10, 0.10]).range([0, width]);
    let yScale = d3.scaleLinear()
        .domain([0, Math.max(
            d3.max(selectedDistribution, d => d.y),
            d3.max(longTermDistribution, d => d.y),
            d3.max(bins, d => (d.length / selectedData.length) / binWidth) || 0
        )])
        .range([height, 0]);
    
    // Update x-axis with transition
    g.select(".x-axis")
        .transition()
        .duration(600)
        .call(d3.axisBottom(xScale).tickFormat(d3.format(".1%")));
    
    // Update histogram bars with smooth transitions
    let histogramBars = g.select(".histogram-bars")
        .selectAll(".histogram-bar")
        .data(bins, d => `${d.x0}-${d.x1}`);
    
    histogramBars.exit()
        .transition()
        .duration(400)
        .attr("height", 0)
        .attr("y", height)
        .style("opacity", 0)
        .remove();
    
    let histogramEnter = histogramBars.enter()
        .append("rect")
        .attr("class", "histogram-bar")
        .attr("x", d => xScale(d.x0))
        .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
        .attr("y", height)
        .attr("height", 0)
        .style("fill", "rgba(255, 107, 107, 0.3)")
        .style("stroke", "#ff6b6b")
        .style("stroke-width", 0.5)
        .style("opacity", 0);
    
    histogramBars.merge(histogramEnter)
        .transition()
        .duration(600)
        .ease(d3.easeQuadInOut)
        .attr("x", d => xScale(d.x0))
        .attr("width", d => Math.max(0, xScale(d.x1) - xScale(d.x0) - 1))
        .attr("y", d => yScale((d.length / selectedData.length) / binWidth))
        .attr("height", d => height - yScale((d.length / selectedData.length) / binWidth))
        .style("opacity", 1);
    
    // smooth transitions
    let line = d3.line()
        .x(d => xScale(d.x))
        .y(d => yScale(d.y))
        .curve(d3.curveMonotoneX);
    
    let distributionLines = g.select(".distribution-lines");
    
    // full data normal line
    let longTermLine = distributionLines.select(".long-term-line");
    if (longTermLine.empty()) {
        longTermLine = distributionLines.append("path")
            .attr("class", "long-term-line")
            .style("stroke", "#999")
            .style("stroke-width", 2)
            .style("fill", "none")
            .style("stroke-dasharray", "5,5")
            .style("opacity", 0.6);
    }
    
    longTermLine
        .datum(longTermDistribution)
        .transition()
        .duration(600)
        .ease(d3.easeQuadInOut)
        .attr("d", line);
    
    // filtered normal dist line
    let selectedLine = distributionLines.select(".selected-line");
    if (selectedLine.empty()) {
        selectedLine = distributionLines.append("path")
            .attr("class", "selected-line")
            .style("stroke", "#007bff")
            .style("stroke-width", 3)
            .style("fill", "none");
    }
    
    selectedLine
        .datum(selectedDistribution)
        .transition()
        .duration(600)
        .ease(d3.easeQuadInOut)
        .attr("d", line);
    
    
    let legend = g.select(".legend-group");
    
    // init legend - if needed
    if (legend.select(".legend-selected-line").empty()) {
        legend.append("line")
            .attr("class", "legend-selected-line")
            .attr("x1", 0).attr("x2", 20).attr("y1", 0).attr("y2", 0)
            .style("stroke", "#007bff").style("stroke-width", 3);
        legend.append("text")
            .attr("class", "legend-selected-text")
            .attr("x", 25).attr("y", 4).style("font-size", "11px")
            .text("Selected Theory");
        
        legend.append("line")
            .attr("class", "legend-longterm-line")
            .attr("x1", 0).attr("x2", 20).attr("y1", 15).attr("y2", 15)
            .style("stroke", "#999").style("stroke-width", 2).style("stroke-dasharray", "5,5");
        legend.append("text")
            .attr("class", "legend-longterm-text")
            .attr("x", 25).attr("y", 19).style("font-size", "11px")
            .text("Long-term Theory");
        
        legend.append("rect")
            .attr("class", "legend-histogram-rect")
            .attr("x", 0).attr("y", 25).attr("width", 20).attr("height", 10)
            .style("fill", "rgba(255, 107, 107, 0.3)").style("stroke", "#ff6b6b");
        legend.append("text")
            .attr("class", "legend-histogram-text")
            .attr("x", 25).attr("y", 34).style("font-size", "11px")
            .text("Actual Returns");
            
    }
}

// data load from JSON file - todo remove unused fields!
d3.json("spy_data_complete.json").then(function(rawData) {
    data = rawData.map(d => ({
        date: d3.timeParse("%m/%d/%y")(d.Date),
        spyClose: +d.SPY_Close,
        vixClose: +d.VIX_Close,
        spyReturn: +d.SPY_Return,
        trailingVol20d: +d.TrailingVol_20d,
        targetRealizedVol20d: +d.Target_RealizedVol_20d
    }));
    
    longTermAverageVix = calculateAverageVix(data);
    longTermAverageRealizedVol = calculateAverageRealizedVol(data);
    createSharedChart();
    
    // start at scene 1
    updateChartForScene(1);
    setupAnimations(1);
    
    initializeDistributionCharts();
}).catch(function(error) {
    console.error("error loading data!!!", error);
});
