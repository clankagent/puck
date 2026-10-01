use crate::*;
const DIRS: [&str; 4] = ["clockwise", "counterclockwise", "push", "pull"];
const TILTS: [&str; 4] = ["rx+", "rx-", "ry+", "ry-"];
pub fn quantile(v: &[f64], p: f64) -> f64 {
    let mut a = v.to_vec();
    a.sort_by(f64::total_cmp);
    let at = (a.len() - 1) as f64 * p;
    let lo = at.floor() as usize;
    let hi = at.ceil() as usize;
    a[lo] + (a[hi] - a[lo]) * (at - lo as f64)
}
fn mean(v: &[f64]) -> f64 {
    v[0] + v.iter().map(|b| b - v[0]).sum::<f64>() / v.len() as f64
}
fn clamp(v: f64, min: f64, max: f64) -> f64 {
    min.max(max.min(v))
}
fn recordings(input: &Value) -> Result<Vec<Value>> {
    let r = if let Some(a) = input.as_array() {
        a.clone()
    } else {
        vec![input.clone()]
    };
    if r.is_empty() || r.len() > 20 {
        return Err("Use one to twenty recordings.".into());
    }
    for c in &r {
        recording::validate(c)?;
    }
    Ok(r)
}
#[derive(Clone, Copy)]
struct Point {
    t: f64,
    v: f64,
    other: f64,
    tilt: f64,
}
fn episode(
    points: &[Point],
    direction: &str,
    recording: usize,
    segment: usize,
    floor: f64,
    pulses: &mut Vec<Value>,
    issues: &mut Vec<String>,
) {
    if points.len() < 3 || points[0].v > floor || points.last().unwrap().v > floor {
        return;
    }
    if ["push", "pull"].contains(&direction) && points.iter().any(|p| p.tilt >= 0.25) {
        issues.push(
            "Excluded a press with tilt; use calibratePressTilts for combined gestures.".into(),
        );
        return;
    }
    let mut selected: Vec<usize> = vec![];
    for i in 1..points.len() - 1 {
        if points[i].v >= 0.06_f64.max(floor * 2.5)
            && points[i].v >= points[i - 1].v
            && points[i].v > points[i + 1].v
        {
            if let Some(&prev) = selected.last() {
                let valley = points[prev..=i]
                    .iter()
                    .map(|p| p.v)
                    .fold(f64::INFINITY, f64::min);
                if valley > points[prev].v.min(points[i].v) * 0.45
                    || points[i].t - points[prev].t < 70.
                {
                    if points[i].v > points[prev].v {
                        *selected.last_mut().unwrap() = i;
                    }
                } else {
                    selected.push(i);
                }
            } else {
                selected.push(i);
            }
        }
    }
    let mut bounds = vec![0];
    for i in 1..selected.len() {
        let mut index = selected[i - 1];
        let from = index;
        for j in from..=selected[i] {
            if points[j].v < points[index].v {
                index = j;
            }
        }
        bounds.push(index);
    }
    bounds.push(points.len() - 1);
    for (i, &peak) in selected.iter().enumerate() {
        let from = points[bounds[i]];
        let to = points[bounds[i + 1]];
        let top = points[peak];
        let duration = to.t - from.t;
        if top.v < top.other * 1.4 {
            continue;
        }
        if !(45. ..=1000.).contains(&duration) {
            issues.push(format!(
                "Excluded {direction} excursion outside 45–1000 ms."
            ));
            continue;
        }
        pulses.push(json!({"direction":direction,"start":from.t,"end":to.t,"peak":top.v,"peakTime":top.t,"valleyBefore":from.v,"recording":recording,"segment":segment}));
    }
}
fn unique(issues: Vec<String>) -> Vec<String> {
    let mut v = vec![];
    for i in issues {
        if !v.contains(&i) {
            v.push(i);
        }
    }
    v
}
pub fn simple(input: &Value, settings: &Value) -> Result<Value> {
    let minimum = number(settings, "minimumPerAction", 3.);
    let floor = number(settings, "detectionFloor", 0.025);
    let gap = number(settings, "pairGapMs", 250.);
    if !minimum.is_finite()
        || minimum.fract() != 0.
        || !(3. ..=100.).contains(&minimum)
        || !floor.is_finite()
        || floor <= 0.
        || floor > 0.1
        || !gap.is_finite()
        || !(50. ..=500.).contains(&gap)
    {
        return Err(
            "Invalid calibration limits; at least three examples per action are required.".into(),
        );
    }
    let captures = recordings(input)?;
    let mut pulses = vec![];
    let mut issues = vec![];
    for (index, c) in captures.iter().enumerate() {
        for (di, direction) in DIRS.iter().enumerate() {
            let vertical = di >= 2;
            let sign = if di % 2 == 0 { 1. } else { -1. };
            let mut run = vec![];
            let mut previous: Option<Point> = None;
            let mut segment = 0;
            for row in c["timeline"].as_array().unwrap() {
                if row["type"] == "reset" {
                    run.clear();
                    previous = None;
                    segment += 1;
                    continue;
                }
                if row["type"] != "input" {
                    continue;
                }
                let s = input_values(row);
                let point = Point {
                    t: number(row, "t", 0.),
                    v: (sign * s[if vertical { 2 } else { 5 }]).max(0.),
                    other: s[if vertical { 5 } else { 2 }].abs(),
                    tilt: s[3].abs().max(s[4].abs()),
                };
                if point.v > floor {
                    if run.is_empty()
                        && let Some(mut p) = previous
                    {
                        p.t = point.t;
                        run.push(p);
                    }
                    run.push(point);
                } else if !run.is_empty() {
                    run.push(point);
                    episode(
                        &run,
                        direction,
                        index,
                        segment,
                        floor,
                        &mut pulses,
                        &mut issues,
                    );
                    run.clear();
                }
                previous = Some(point);
            }
            if !run.is_empty() {
                issues.push(format!(
                    "Unfinished {direction} excursion at recording end."
                ));
            }
        }
    }
    pulses.sort_by(|a, b| {
        number(a, "recording", 0.)
            .total_cmp(&number(b, "recording", 0.))
            .then_with(|| number(a, "start", 0.).total_cmp(&number(b, "start", 0.)))
    });
    let mut counts = serde_json::Map::new();
    for d in DIRS {
        for kind in ["single", "double"] {
            counts.insert(format!("{d}.{kind}"), json!(0));
        }
    }
    let paired = |a: &Value, b: &Value| {
        a["recording"] == b["recording"]
            && a["segment"] == b["segment"]
            && a["direction"] == b["direction"]
            && number(b, "start", 0.) - number(a, "end", 0.) <= gap
            && number(b, "end", 0.) - number(a, "end", 0.) <= 650.
    };
    let mut actions = vec![];
    let mut ambiguous = false;
    let mut i = 0;
    while i < pulses.len() {
        let mut end = i + 1;
        while end < pulses.len() && paired(&pulses[end - 1], &pulses[end]) {
            end += 1;
        }
        if end - i > 2 {
            ambiguous = true;
            issues.push(format!(
                "Ambiguous run of {} {} pulses near {:.1} s; leave a longer pause between actions.",
                end - i,
                string(&pulses[i], "direction", ""),
                number(&pulses[i], "start", 0.) / 1000.
            ));
            i = end;
            continue;
        }
        let group = &pulses[i..end];
        let kind = if group.len() == 2 { "double" } else { "single" };
        let direction = string(&group[0], "direction", "");
        actions.push(json!({"direction":direction,"kind":kind,"start":group[0]["start"],"end":group.last().unwrap()["end"],"pulses":group,"recording":group[0]["recording"]}));
        let key = format!("{direction}.{kind}");
        counts[&key] = json!(counts[&key].as_u64().unwrap() + 1);
        i = end;
    }
    let mut stats = serde_json::Map::new();
    for d in DIRS {
        let values: Vec<_> = pulses
            .iter()
            .filter(|p| p["direction"] == d)
            .map(|p| number(p, "peak", 0.))
            .collect();
        if !values.is_empty() {
            stats.insert(d.into(),json!({"count":values.len(),"center":mean(&values),"low":quantile(&values,0.1),"high":quantile(&values,0.9),"min":values.iter().copied().fold(f64::INFINITY,f64::min),"max":values.iter().copied().fold(0.,f64::max)}));
        }
    }
    let missing: Vec<_> = counts
        .iter()
        .filter(|(_, v)| v.as_f64().unwrap() < minimum)
        .map(|(k, _)| k.clone())
        .collect();
    let mut tune = Value::Null;
    if missing.is_empty() && !ambiguous {
        let band = |d: &str| {
            let s = &stats[d];
            let activation = clamp(
                number(s, "low", 0.) * 0.7,
                0.04,
                number(s, "min", 0.) * 0.85,
            );
            let returns = pulses
                .iter()
                .filter(|p| p["direction"] == d)
                .map(|p| number(p, "valleyBefore", 0.) * 1.2)
                .fold(activation * 0.5, f64::max);
            let release = clamp(returns, 0.01, activation * 0.8);
            json!({"center":s["center"],"low":s["low"],"high":s["high"],"activation":activation,"release":release})
        };
        let cw = band("clockwise");
        let ccw = band("counterclockwise");
        let mut rotation = json!({});
        for k in ["center", "low", "high", "activation"] {
            rotation[k] = json!((number(&cw, k, 0.) + number(&ccw, k, 0.)) / 2.);
        }
        rotation["release"] = json!(
            number(&cw, "release", 0.)
                .max(number(&ccw, "release", 0.))
                .min(number(&rotation, "activation", 0.) * 0.85)
        );
        let lengths: Vec<_> = pulses
            .iter()
            .map(|p| number(p, "end", 0.) - number(p, "start", 0.))
            .collect();
        let doubles = actions
            .iter()
            .filter(|a| a["kind"] == "double")
            .map(|a| number(&a["pulses"][1], "end", 0.) - number(&a["pulses"][0], "end", 0.))
            .fold(0., f64::max);
        tune = tune::validate(
            &json!({"version":1,"rotation":rotation,"push":band("push"),"pull":band("pull"),"dominance":1.4,"timing":{"minPulseMs":clamp(quantile(&lengths,0.1)*0.2,15.,60.).round(),"maxPulseMs":clamp(quantile(&lengths,0.9)*2.,350.,1000.).round(),"neutralMs":20,"doubleMs":clamp(doubles+40.,200.,650.).round()}}),
        )?;
    }
    Ok(
        json!({"status":if ambiguous{"ambiguous"}else if !missing.is_empty(){"incomplete"}else{"ready"},"tune":tune,"counts":counts,"missing":missing,"pulses":pulses,"actions":actions,"stats":stats,"issues":unique(issues)}),
    )
}
fn input_values(row: &Value) -> Input {
    input(&row["input"]).unwrap()
}
fn base(settings: &Value) -> Result<Value> {
    tune::validate(settings.get("baseTune").unwrap_or(&tune::default_tune()))
}
pub fn press_tilts(captures: &Value, settings: &Value) -> Result<Value> {
    let captures = recordings(captures)?;
    let minimum = number(settings, "minimumPerAction", 3.);
    let base = base(settings)?;
    if !minimum.is_finite() || minimum.fract() != 0. || !(3. ..=100.).contains(&minimum) {
        return Err("Use 1–20 recordings and at least three examples per action.".into());
    }
    let mut counts = serde_json::Map::new();
    for d in ["push", "pull"] {
        for tilt in TILTS {
            counts.insert(format!("{d}.{tilt}"), json!(0));
        }
    }
    let mut actions = vec![];
    let mut issues = vec![];
    let mut ambiguous = false;
    let mut finish = |rows: &[Value], recording: usize, issues: &mut Vec<String>| {
        if rows.is_empty() {
            return;
        }
        let peak = |axis: usize| {
            let mut top = 0;
            for i in 1..rows.len() {
                if input_values(&rows[i])[axis].abs() > input_values(&rows[top])[axis].abs() {
                    top = i;
                }
            }
            top
        };
        let px = peak(3);
        let py = peak(4);
        let pz = peak(2);
        let axis = if input_values(&rows[px])[3].abs() >= input_values(&rows[py])[4].abs() {
            3
        } else {
            4
        };
        let top = if axis == 3 { px } else { py };
        let strength = input_values(&rows[top])[axis].abs();
        let other = rows
            .iter()
            .map(|r| input_values(r)[if axis == 3 { 4 } else { 3 }].abs())
            .fold(0., f64::max);
        if strength < 0.25 {
            return;
        }
        let direction = if input_values(&rows[pz])[2] > 0. {
            "push"
        } else {
            "pull"
        };
        let opposite = if direction == "push" { "pull" } else { "push" };
        let sign = if direction == "push" { 1. } else { -1. };
        let pressure = rows
            .iter()
            .find(|r| input_values(r)[2] * sign >= number(&base[direction], "activation", 0.));
        let onset = rows.iter().find(|r| input_values(r)[axis].abs() >= 0.25);
        if pressure.is_none()
            || onset.is_none()
            || number(onset.unwrap(), "t", 0.) < number(pressure.unwrap(), "t", 0.)
            || number(rows.last().unwrap(), "t", 0.) - number(&rows[0], "t", 0.) > 1500.
            || rows
                .iter()
                .any(|r| input_values(r)[2] * sign < -number(&base[opposite], "activation", 0.))
            || strength < other * 1.25
        {
            ambiguous = true;
            issues.push(
                "Excluded a tilt with ambiguous direction, pressure order, reversal or duration."
                    .to_string(),
            );
            return;
        }
        let tilt = format!(
            "{}{}",
            AXES[axis],
            if input_values(&rows[top])[axis] > 0. {
                "+"
            } else {
                "-"
            }
        );
        actions.push(json!({"direction":direction,"tilt":tilt,"kind":"single","recording":recording,"start":pressure.unwrap()["t"],"end":rows.last().unwrap()["t"],"pressurePeak":input_values(&rows[pz])[2].abs(),"tiltPeak":strength,"pressureAtTiltPeak":input_values(&rows[top])[2].abs(),"onsetDelayMs":number(onset.unwrap(),"t",0.)-number(pressure.unwrap(),"t",0.)}));
        let key = format!("{direction}.{tilt}");
        counts[&key] = json!(counts[&key].as_u64().unwrap() + 1);
    };
    for (index, c) in captures.iter().enumerate() {
        let mut run = vec![];
        let mut quiet: Option<f64> = None;
        let mut armed = false;
        let mut last: Option<&Value> = None;
        for row in c["timeline"].as_array().unwrap() {
            if row["type"] == "reset" {
                if !run.is_empty() {
                    issues.push("Discarded an interrupted excursion.".to_string());
                }
                run.clear();
                quiet = None;
                armed = false;
                continue;
            }
            if row["type"] != "input" {
                continue;
            }
            last = Some(row);
            let s = input_values(row);
            let magnitude = s[2].abs().max(s[3].abs()).max(s[4].abs());
            let t = number(row, "t", 0.);
            if magnitude <= 0.06 {
                armed = true;
                quiet.get_or_insert(t);
                continue;
            }
            if !run.is_empty() && quiet.is_some_and(|at| t - at > 180.) {
                finish(&run, index, &mut issues);
                run.clear();
            }
            if armed {
                run.push(row.clone());
            }
            quiet = None;
        }
        if !run.is_empty() {
            if last.is_some_and(|r| {
                let s = input_values(r);
                s[2].abs().max(s[3].abs()).max(s[4].abs()) <= 0.06
            }) {
                finish(&run, index, &mut issues);
            } else {
                issues.push("Discarded an unfinished excursion at recording end.".into());
            }
        }
    }
    let missing: Vec<_> = counts
        .iter()
        .filter(|(_, v)| v.as_f64().unwrap() < minimum)
        .map(|(k, _)| k.clone())
        .collect();
    let mut tune = Value::Null;
    if missing.is_empty() && !ambiguous {
        let peaks: Vec<_> = actions.iter().map(|a| number(a, "tiltPeak", 0.)).collect();
        let activation = 0.25_f64.min(peaks.iter().copied().fold(f64::INFINITY, f64::min) * 0.8);
        let center = mean(&peaks);
        let delay = actions
            .iter()
            .map(|a| number(a, "onsetDelayMs", 0.))
            .fold(0., f64::max);
        let duration = actions
            .iter()
            .map(|a| number(a, "end", 0.) - number(a, "start", 0.))
            .fold(0., f64::max);
        let mut d = base.clone();
        d["pressTilt"] = json!({"force":{"center":center,"low":center.min(quantile(&peaks,0.1)),"high":center.max(quantile(&peaks,0.9)),"activation":activation,"release":activation*0.48},"minMs":25,"armMs":450_f64.max(((delay+80.)/50.).ceil()*50.),"relaxMs":180,"maxMs":1000_f64.max((duration*1.5/50.).ceil()*50.),"dominance":1.25});
        tune = tune::validate(&d)?;
    }
    Ok(
        json!({"status":if ambiguous{"ambiguous"}else if !missing.is_empty(){"incomplete"}else{"ready"},"tune":tune,"counts":counts,"missing":missing,"actions":actions,"issues":unique(issues)}),
    )
}
pub fn tilts(captures: &Value, settings: &Value) -> Result<Value> {
    let mut captures = recordings(captures)?;
    let base = base(settings)?;
    for c in &mut captures {
        let mut owned = false;
        for row in c["timeline"].as_array_mut().unwrap() {
            if row["type"] == "reset" {
                owned = false;
                continue;
            }
            if row["type"] != "input" {
                continue;
            }
            let v = input_values(row);
            if v[2].abs().max(v[5].abs()).max(v[3].abs()).max(v[4].abs()) <= 0.06 {
                owned = false;
            }
            if v[3].abs().max(v[4].abs()) < 0.15
                && (v[2] >= number(&base["push"], "activation", 0.)
                    || -v[2] >= number(&base["pull"], "activation", 0.)
                    || v[5].abs() >= number(&base["rotation"], "activation", 0.))
            {
                owned = true;
            }
            if owned {
                *row = json!({"type":"reset","t":row["t"]});
            } else {
                row["input"] = input_json([0., 0., v[4], 0., 0., v[3]]);
            }
        }
    }
    let mut config = json!({"detectionFloor":0.06});
    if let Some(m) = settings.get("minimumPerAction") {
        config["minimumPerAction"] = m.clone();
    }
    let result = simple(&json!(captures), &config)?;
    let rename = |key: &str| {
        let (d, kind) = key.split_once('.').unwrap();
        format!(
            "{}.{kind}",
            TILTS[DIRS.iter().position(|x| *x == d).unwrap()]
        )
    };
    let counts: serde_json::Map<_, _> = result["counts"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, v)| (rename(k), v.clone()))
        .collect();
    let mut tune = Value::Null;
    if !result["tune"].is_null() {
        let t = &result["tune"];
        let activation = number(&t["rotation"], "activation", 0.).min(
            number(&result["stats"]["clockwise"], "min", 0.).min(number(
                &result["stats"]["counterclockwise"],
                "min",
                0.,
            )) * 0.85,
        );
        let mut rx = t["rotation"].clone();
        rx["activation"] = json!(activation);
        rx["release"] = json!(number(&rx, "release", 0.).min(activation * 0.8));
        let mut ry = json!({});
        for k in ["center", "low", "high", "activation", "release"] {
            ry[k] = json!((number(&t["push"], k, 0.) + number(&t["pull"], k, 0.)) / 2.);
        }
        let mut timing = t["timing"].clone();
        timing["minPulseMs"] = json!(25_f64.min(number(&timing, "minPulseMs", 0.)));
        timing["neutralMs"] = json!(10);
        let mut d = base;
        d["standaloneTilt"] = json!({"rx":rx,"ry":ry,"timing":timing});
        tune = tune::validate(&d)?;
    }
    let actions:Vec<_>=result["actions"].as_array().unwrap().iter().map(|a|json!({"direction":TILTS[DIRS.iter().position(|d|a["direction"]==*d).unwrap()],"kind":a["kind"],"start":a["start"],"end":a["end"],"recording":a["recording"]})).collect();
    let stats: serde_json::Map<_, _> = result["stats"]
        .as_object()
        .unwrap()
        .iter()
        .map(|(k, v)| {
            (
                TILTS[DIRS.iter().position(|d| *d == k).unwrap()].to_string(),
                v.clone(),
            )
        })
        .collect();
    let issues: Vec<_> = result["issues"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| {
            let mut s = v.as_str().unwrap().to_string();
            for i in [1, 0, 2, 3] {
                s = s.replace(DIRS[i], TILTS[i]);
            }
            s
        })
        .collect();
    Ok(
        json!({"status":result["status"],"tune":tune,"counts":counts,"missing":result["missing"].as_array().unwrap().iter().map(|v|rename(v.as_str().unwrap())).collect::<Vec<_>>(),"actions":actions,"stats":stats,"issues":issues}),
    )
}
