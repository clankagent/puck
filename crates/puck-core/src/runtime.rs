use crate::{definitions::*, gestures::Gestures, *};
use std::collections::BTreeSet;
struct Entry {
    def: Value,
    name: String,
    context: Option<String>,
    mode: String,
    channels: Vec<usize>,
    blocked: bool,
    suppressed: Option<String>,
    recognizer: Option<Gestures>,
    value_def: Option<Value>,
    value: Value,
    velocity: Vec<f64>,
    total: Vec<f64>,
    sector: Option<usize>,
    active: bool,
    session: u64,
    started: f64,
    pending: Option<f64>,
    releasing: Option<f64>,
    cancel_recognizer: Option<Gestures>,
    cancel_pulse: Option<(String, f64)>,
    pair_sign: f64,
}
impl Entry {
    fn new(name: String, context: Option<String>, def: Value) -> Result<Self> {
        let def = normalize(&def)?;
        let (mode, channels) = ownership(&def)?;
        let value_def = value_definition(&def)?;
        let n = match &value_def {
            Some(v) => source_axes(string(v, "source", ""))?.len(),
            None => 0,
        };
        let recognizer = if def["kind"] == "gesture" {
            Some(Gestures::new(def["options"].clone())?)
        } else {
            None
        };
        Ok(Self {
            suppressed: None,
            blocked: def["kind"] == "interaction",
            def,
            name,
            context,
            mode,
            channels,
            recognizer,
            value_def,
            value: Value::Null,
            velocity: vec![0.; n],
            total: vec![0.; n],
            sector: None,
            active: false,
            session: 0,
            started: 0.,
            pending: None,
            releasing: None,
            cancel_recognizer: None,
            cancel_pulse: None,
            pair_sign: 0.,
        })
    }
    fn enabled(&self, context: &Option<String>) -> bool {
        self.context.is_none() || &self.context == context
    }
    fn eligible(&self, context: &Option<String>) -> bool {
        self.enabled(context) && self.suppressed.is_none() && !self.blocked
    }
    fn overlap(&self, b: &Self) -> bool {
        self.channels.iter().any(|c| b.channels.contains(c))
    }
    fn interpret(&mut self, sample: Input) -> Value {
        let d = self.value_def.as_ref().unwrap();
        let o = &d["options"];
        if o["as"] != "direction" {
            return shaped(
                d,
                if o["as"] == "velocity" {
                    self.velocity.clone()
                } else {
                    array_value(d, sample)
                },
            );
        }
        let axes = source_axes(string(d, "source", "")).unwrap();
        let x = component(d, sample, axes[0]);
        let y = component(d, sample, axes[1]);
        if x.hypot(y) <= number(o, "deadzone", 0.) {
            if !boolean(o, "sticky", false) {
                self.sector = None;
            }
            return json!(self.sector);
        }
        let n = number(o, "sectors", 8.) as usize;
        let step = std::f64::consts::TAU / n as f64;
        let angle = (y.atan2(x) + std::f64::consts::TAU) % std::f64::consts::TAU;
        if let Some(s) = self.sector {
            let diff = angle - s as f64 * step;
            if diff.sin().atan2(diff.cos()).abs() < step / 2. + number(o, "hysteresis", 0.) {
                return json!(s);
            }
        }
        self.sector = Some((angle / step).round() as usize % n);
        json!(self.sector)
    }
}
fn component(d: &Value, s: Input, a: usize) -> f64 {
    s[a] * if d["source"] == "tilt" && a == 4 {
        -1.
    } else {
        1.
    } * number(&d["options"]["scale"], AXES[a], 1.)
}
fn array_value(d: &Value, s: Input) -> Vec<f64> {
    let o = &d["options"];
    source_axes(string(d, "source", ""))
        .unwrap()
        .iter()
        .map(|&a| {
            let mut v = component(d, s, a);
            if d["source"] == "pull" {
                v = (-v).max(0.);
            }
            if d["source"] == "push" {
                v = v.max(0.);
            }
            v = v.clamp(-1., 1.);
            let dz = number(o, "deadzone", 0.);
            v = if v.abs() <= dz {
                0.
            } else {
                v.signum() * ((v.abs() - dz) / (1. - dz)).powf(number(o, "curve", 1.))
            };
            if o["as"] == "velocity" {
                v *= o["speed"].as_f64().unwrap_or_else(|| {
                    number(
                        &o["speed"],
                        if a >= 3 { "rotation" } else { "translation" },
                        1.,
                    )
                });
            }
            v
        })
        .collect()
}
fn shaped(d: &Value, v: Vec<f64>) -> Value {
    if d["source"] == "axes" {
        Value::Object(
            AXES.iter()
                .zip(v)
                .map(|(a, v)| (a.to_string(), json!(v)))
                .collect(),
        )
    } else if v.len() == 1 {
        json!(v[0])
    } else {
        json!(v)
    }
}
fn prefers(p: &[Vec<usize>], a: usize, b: usize, seen: &mut BTreeSet<usize>) -> bool {
    let mut pending = vec![a];
    while let Some(i) = pending.pop() {
        if !seen.insert(i) {
            continue;
        }
        for &next in &p[i] {
            if next == b {
                return true;
            }
            pending.push(next);
        }
    }
    false
}
pub struct Runtime {
    entries: Vec<Entry>,
    preferences: Vec<Vec<usize>>,
    ordered: Vec<usize>,
    context: Option<String>,
    contexts: Vec<String>,
    sample: Input,
    now: Option<f64>,
    frame_at: Option<f64>,
    max_frame: f64,
    event_limit: usize,
    sequence: u64,
    session: u64,
    pending_events: Vec<Value>,
    events: Vec<Value>,
    log: Vec<Value>,
    definition: Value,
    trace: bool,
    record: bool,
    recording_limit: usize,
    timeline: Vec<Value>,
    full: bool,
}
impl Runtime {
    pub fn new(options: Value) -> Result<Self> {
        let max_frame = number(&options, "maxFrameMs", 50.);
        let event_limit = number(&options, "eventLimit", 2048.);
        let recording_limit = number(&options, "recordingLimit", 50000.);
        finite(max_frame, "maxFrameMs", 0., f64::MAX)?;
        finite(event_limit, "eventLimit", 1., 100000.)?;
        finite(recording_limit, "recordingLimit", 1., 1000000.)?;
        if event_limit.fract() != 0. || recording_limit.fract() != 0. {
            return Err("Limits must be integers.".into());
        }
        let mut entries = vec![];
        let mut contexts = vec![];
        let controls = options.get("controls").cloned().unwrap_or(json!({}));
        let groups = options.get("contexts").cloned().unwrap_or(json!({}));
        let mut add = |g: &Value, context: Option<String>| -> Result<()> {
            for (key, d) in g.as_object().ok_or("Invalid control group.")? {
                if key.is_empty()
                    || key.contains('.')
                    || context
                        .as_ref()
                        .is_some_and(|c| c.is_empty() || c.contains('.'))
                {
                    return Err(
                        "Control/context names must be nonempty and cannot contain dots.".into(),
                    );
                }
                let name = context.as_ref().map_or_else(
                    || format!("controls.{key}"),
                    |c| format!("contexts.{c}.{key}"),
                );
                entries.push(Entry::new(name, context.clone(), d.clone())?);
            }
            Ok(())
        };
        add(&controls, None)?;
        for (c, g) in groups.as_object().ok_or("Invalid contexts.")? {
            if c.is_empty() || c.contains('.') {
                return Err("Invalid context name.".into());
            }
            contexts.push(c.clone());
            add(g, Some(c.clone()))?;
        }
        if entries.len() > 256 {
            return Err("Too many controls.".into());
        }
        let context = options
            .get("context")
            .map(|v| v.as_str().ok_or("Unknown context.").map(str::to_string))
            .transpose()?;
        if context.as_ref().is_some_and(|c| !contexts.contains(c)) {
            return Err("Unknown context.".into());
        }
        let mut preferences = vec![vec![]; entries.len()];
        let conflicts = options.get("conflicts").cloned().unwrap_or(json!([]));
        let index = |v: &Value| {
            entries
                .iter()
                .position(|e| Some(e.name.as_str()) == v.as_str())
                .ok_or("Handle is not registered in this Puck instance.")
        };
        for rule in conflicts.as_array().ok_or("Invalid conflicts.")? {
            let a = index(&rule["prefer"])?;
            for b in rule["over"].as_array().ok_or("Invalid conflict rule.")? {
                let b = index(b)?;
                if !preferences[a].contains(&b) {
                    preferences[a].push(b);
                }
            }
        }
        let pref = |a, b| prefers(&preferences, a, b, &mut BTreeSet::new());
        for i in 0..entries.len() {
            if pref(i, i) {
                return Err("Cyclic control precedence.".into());
            }
            for j in i + 1..entries.len() {
                let a = &entries[i];
                let b = &entries[j];
                let opposite =
                    a.def["kind"] == "interaction" && b.def["kind"] == "interaction" && {
                        let aa = activation(string(&a.def["options"], "activation", ""))?;
                        let bb = activation(string(&b.def["options"], "activation", ""))?;
                        aa.0 == bb.0 && aa.1 != bb.1
                    };
                if a.context.is_some() && b.context.is_some() && a.context != b.context
                    || a.mode == "observe"
                    || b.mode == "observe"
                    || !a.overlap(b)
                    || opposite
                {
                    continue;
                }
                if (a.mode == "exclusive" || b.mode == "exclusive") && !pref(i, j) && !pref(j, i) {
                    return Err(format!(
                        "Unresolved ownership conflict: {} / {}. Declare preference, contexts, shared or observe ownership.",
                        a.name, b.name
                    ));
                }
            }
        }
        let mut ordered: Vec<_> = (0..entries.len()).collect();
        ordered.sort_by(|&a, &b| {
            if pref(a, b) {
                std::cmp::Ordering::Less
            } else if pref(b, a) {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Equal
            }
        });
        let mut definition = json!({"controls":controls,"contexts":groups,"conflicts":conflicts,"maxFrameMs":max_frame,"eventLimit":event_limit});
        if let Some(c) = &context {
            definition["context"] = json!(c);
        }
        Ok(Self {
            entries,
            preferences,
            ordered,
            context,
            contexts,
            sample: [0.; 6],
            now: None,
            frame_at: None,
            max_frame,
            event_limit: event_limit as usize,
            sequence: 0,
            session: 0,
            pending_events: vec![],
            events: vec![],
            log: vec![],
            definition,
            trace: boolean(&options, "trace", false),
            record: boolean(&options, "record", false),
            recording_limit: recording_limit as usize,
            timeline: vec![],
            full: false,
        })
    }
    fn index(&self, r: &Value) -> Result<usize> {
        self.entries
            .iter()
            .position(|e| Some(e.name.as_str()) == r.as_str())
            .ok_or("Handle is not registered in this Puck instance.".into())
    }
    fn emit(&mut self, i: usize, mut data: Value) {
        let e = &self.entries[i];
        data["control"] = json!(e.name);
        if self.trace {
            data["evidence"] = json!({"input":input_json(self.sample),"context":self.context,"control":e.name,"settings":e.def["options"]});
        }
        self.pending_events.push(data);
    }
    fn end(&mut self, i: usize, t: f64, reason: Option<&str>) {
        let e = &self.entries[i];
        if e.active {
            let mut data = json!({"type":if reason.is_some(){"cancel"}else{"commit"},"sessionId":e.session,"timestamp":t});
            if let Some(r) = reason {
                data["reason"] = json!(r);
            } else {
                data["value"] = e.value.clone();
            }
            self.emit(i, data);
        }
        let e = &mut self.entries[i];
        e.active = false;
        e.pending = None;
        e.releasing = None;
        e.blocked = true;
        e.value = Value::Null;
        e.sector = None;
        e.velocity.fill(0.);
        e.cancel_recognizer = None;
        e.cancel_pulse = None;
    }
    fn reset(&mut self, i: usize, t: f64, reason: &str) -> Result<()> {
        self.end(i, t, Some(reason));
        if let Some(g) = &mut self.entries[i].recognizer {
            g.reset(Some(t))?;
        }
        Ok(())
    }
    fn neutral(&self, i: usize) -> bool {
        self.entries[i].channels.iter().all(|&a| {
            self.sample[a].abs()
                <= match a {
                    2 => {
                        if self.sample[2] >= 0. {
                            0.08
                        } else {
                            0.06
                        }
                    }
                    5 => 0.15,
                    3 => 0.104,
                    4 => 0.16,
                    _ => 0.05,
                }
        })
    }
    fn route(&mut self, t: f64, report: bool) -> Result<()> {
        let mut sorted = self.ordered.clone();
        sorted.sort_by_key(|&i| !self.entries[i].active);
        let mut winners: Vec<usize> = vec![];
        for i in sorted {
            let e = &self.entries[i];
            let mut candidate = e.enabled(&self.context) && e.mode == "exclusive";
            if e.def["kind"] == "interaction" {
                let o = &e.def["options"];
                let (a, s) = activation(string(o, "activation", ""))?;
                candidate = candidate
                    && (e.active
                        || e.pending.is_some()
                        || !e.blocked && self.sample[a] * s >= number(o, "enter", 0.));
            }
            if candidate && !winners.iter().any(|&w| self.entries[w].overlap(e)) {
                winners.push(i);
            }
        }
        for i in 0..self.entries.len() {
            let e = &self.entries[i];
            let winner = if e.mode == "observe" {
                None
            } else {
                winners
                    .iter()
                    .find(|&&w| w != i && self.entries[w].overlap(e))
                    .map(|&w| self.entries[w].name.clone())
            };
            let suppressed = if !e.enabled(&self.context) {
                Some("context".to_string())
            } else {
                winner
            };
            if suppressed.is_some() && e.suppressed.is_none() {
                self.reset(
                    i,
                    t,
                    if suppressed.as_deref() == Some("context") {
                        "context-change"
                    } else {
                        "ownership"
                    },
                )?;
            }
            self.entries[i].suppressed = suppressed;
            if report
                && self.entries[i].suppressed.is_none()
                && self.entries[i].blocked
                && self.neutral(i)
            {
                let e = &mut self.entries[i];
                e.blocked = false;
                if let Some(g) = &mut e.recognizer {
                    g.update([0.; 6], t)?;
                }
            }
        }
        Ok(())
    }
    fn integrate(&mut self, to: f64) {
        let from = self.now.unwrap_or(to);
        let dt = to - from;
        if dt <= 0. {
            return;
        }
        let allowed = self
            .frame_at
            .map_or(0., |f| (to.min(f + self.max_frame) - from).max(0.));
        for e in &mut self.entries {
            let Some(d) = &e.value_def else { continue };
            if d["options"]["as"] != "velocity" {
                continue;
            }
            let targets =
                if e.eligible(&self.context) && (e.def["kind"] != "interaction" || e.active) {
                    array_value(d, self.sample)
                } else {
                    vec![0.; e.velocity.len()]
                };
            let response = number(&d["options"], "responseMs", 0.);
            for (i, target) in targets.into_iter().enumerate() {
                let initial = if e.velocity[i] * target < 0. || target == 0. {
                    0.
                } else {
                    e.velocity[i]
                };
                let area = if response == 0. {
                    target * allowed
                } else {
                    target * allowed
                        + (initial - target) * response * -(-allowed / response).exp_m1()
                };
                e.total[i] += area / 1000.;
                e.velocity[i] = if response == 0. {
                    target
                } else {
                    target + (initial - target) * (-dt / response).exp()
                };
            }
            if e.active {
                e.value = e.interpret(self.sample);
            }
        }
    }
    fn cancellation(&mut self, i: usize, t: f64, report: bool) -> Result<bool> {
        let e = &mut self.entries[i];
        let Some(g) = &mut e.cancel_recognizer else {
            return Ok(false);
        };
        let c = &e.def["options"]["cancel"];
        let a = if c["input"] == "twist" {
            5
        } else {
            activation(string(c, "input", ""))?.0
        };
        let mut filtered = [0.; 6];
        filtered[a] = self.sample[a];
        let events = if report {
            g.update(filtered, t)?
        } else {
            g.advance(t)?
        };
        let direction = if c["direction"] == "same" {
            json!("either")
        } else {
            c.get("direction").cloned().unwrap_or(json!("either"))
        };
        for event in events.as_array().unwrap() {
            if c["count"] == 2
                && matches(
                    &c["input"],
                    &json!({"count":2,"direction":direction}),
                    event,
                )
            {
                return Ok(true);
            }
            if !matches(
                &c["input"],
                &json!({"count":1,"direction":direction}),
                event,
            ) {
                continue;
            }
            if number(c, "count", 1.) == 1. {
                return Ok(true);
            }
            let dir = string(event, "direction", "").to_string();
            let time = number(event, "timestamp", t);
            if e.cancel_pulse
                .as_ref()
                .is_some_and(|(d, at)| time - at <= 400. && (c["direction"] != "same" || d == &dir))
            {
                return Ok(true);
            }
            e.cancel_pulse = Some((dir, time));
        }
        Ok(false)
    }
    fn process(&mut self, t: f64, report: bool) -> Result<()> {
        self.route(t, report)?;
        for i in self.ordered.clone() {
            if !self.entries[i].eligible(&self.context) {
                continue;
            }
            let kind = string(&self.entries[i].def, "kind", "").to_string();
            if kind == "gesture" {
                let e = &mut self.entries[i];
                let g = e.recognizer.as_mut().unwrap();
                let events = if report {
                    g.update(self.sample, t)?
                } else {
                    g.advance(t)?
                };
                for g in events.as_array().unwrap() {
                    if matches(
                        &self.entries[i].def["input"],
                        &self.entries[i].def["options"],
                        g,
                    ) {
                        self.emit(
                            i,
                            json!({"type":"trigger","timestamp":g["timestamp"],"gesture":g}),
                        );
                    }
                }
                continue;
            }
            if kind == "continuous" {
                let e = &mut self.entries[i];
                e.value = e.interpret(self.sample);
                continue;
            }
            let o = self.entries[i].def["options"].clone();
            let (a, s) = activation(string(&o, "activation", ""))?;
            let pressure = self.sample[a] * s;
            let values = array_value(self.entries[i].value_def.as_ref().unwrap(), self.sample);
            let combined = o["lifetime"] == "combination";
            let value_active = values.iter().any(|v| v.abs() > 0.);
            if !self.entries[i].active {
                let e = &mut self.entries[i];
                if pressure < number(&o, "enter", 0.) || combined && !value_active {
                    e.pending = None;
                    continue;
                }
                let pending = *e.pending.get_or_insert(t);
                if t < pending + number(&o, "holdMs", 0.) {
                    continue;
                }
                self.session += 1;
                e.active = true;
                e.session = self.session;
                e.started = t;
                e.pending = None;
                e.sector = None;
                e.value = e.interpret(self.sample);
                e.pair_sign = if values.len() == 1 {
                    if values[0] == 0. {
                        0.
                    } else {
                        values[0].signum()
                    }
                } else {
                    0.
                };
                if let Some(c) = o.get("cancel") {
                    let mut g = Gestures::new(
                        json!({"pressMode":"simple","standaloneTilt":true,"pressRotate":false,"singleMode":"immediate"}),
                    )?;
                    let mut filtered = [0.; 6];
                    let a = if c["input"] == "twist" {
                        5
                    } else {
                        activation(string(c, "input", ""))?.0
                    };
                    filtered[a] = self.sample[a];
                    g.update(filtered, t)?;
                    e.cancel_recognizer = Some(g);
                }
                let data =
                    json!({"type":"begin","timestamp":t,"sessionId":e.session,"value":e.value});
                self.emit(i, data);
            } else {
                if self.cancellation(i, t, report)? {
                    self.end(i, t, Some("gesture"));
                    continue;
                }
                let e = &mut self.entries[i];
                if pressure < -number(&o, "leave", 0.)
                    || combined
                        && e.pair_sign != 0.
                        && values.len() == 1
                        && values[0] * e.pair_sign < 0.
                {
                    self.end(i, t, Some("reversal"));
                    continue;
                }
                if pressure <= number(&o, "leave", 0.) || combined && !value_active {
                    let releasing = *e.releasing.get_or_insert(t);
                    if t >= releasing + number(&o, "releaseMs", 0.) {
                        let reason = if boolean(&o, "requireValue", false) && e.value.is_null() {
                            Some("no-selection")
                        } else {
                            None
                        };
                        self.end(i, t, reason);
                    }
                } else {
                    e.releasing = None;
                    let v = e.interpret(self.sample);
                    if v != e.value {
                        e.value = v;
                        let data = json!({"type":"update","timestamp":t,"sessionId":e.session,"value":e.value});
                        self.emit(i, data);
                    }
                }
            }
        }
        self.route(t, false)?;
        for e in &mut self.entries {
            if let Some(d) = &e.value_def
                && d["options"]["as"] == "velocity"
            {
                let target =
                    if e.eligible(&self.context) && (e.def["kind"] != "interaction" || e.active) {
                        array_value(d, self.sample)
                    } else {
                        vec![0.; e.velocity.len()]
                    };
                for (i, v) in target.into_iter().enumerate() {
                    if v == 0. || v * e.velocity[i] < 0. {
                        e.velocity[i] = 0.;
                    }
                    if d["options"]["responseMs"] == 0 {
                        e.velocity[i] = v;
                    }
                }
                if e.active {
                    e.value = e.interpret(self.sample);
                }
            }
        }
        Ok(())
    }
    fn advance_to(&mut self, t: f64, stop: bool) -> Result<()> {
        finite(t, "timestamp", -f64::MAX, f64::MAX)?;
        if self.now.is_some_and(|n| t < n) {
            return Err("Puck timestamps must be monotonic.".into());
        }
        while let Some(now) = self.now {
            let mut deadline = t;
            for e in &self.entries {
                if e.def["kind"] == "interaction" {
                    let d = e
                        .releasing
                        .map(|at| at + number(&e.def["options"], "releaseMs", 0.))
                        .or_else(|| {
                            e.pending
                                .map(|at| at + number(&e.def["options"], "holdMs", 0.))
                        });
                    if let Some(d) = d
                        && d > now
                        && d < deadline
                    {
                        deadline = d;
                    }
                }
            }
            self.integrate(deadline);
            self.now = Some(deadline);
            if !(stop && deadline == t) {
                self.process(deadline, false)?;
            }
            if deadline == t {
                return Ok(());
            }
        }
        self.now = Some(t);
        if !stop {
            self.process(t, false)?;
        }
        Ok(())
    }
    fn flush(&mut self) {
        self.pending_events
            .sort_by(|a, b| number(a, "timestamp", 0.).total_cmp(&number(b, "timestamp", 0.)));
        for mut e in self.pending_events.drain(..) {
            self.sequence += 1;
            e["sequence"] = json!(self.sequence);
            let timestamp = e["timestamp"].clone();
            if let Some(ev) = e.get_mut("evidence") {
                ev["dispatchedAt"] = json!(self.now);
                ev["timestamp"] = timestamp;
            }
            self.log.push(e.clone());
            self.events.push(e);
        }
        let excess = self.log.len().saturating_sub(self.event_limit);
        self.log.drain(..excess);
    }
    pub fn feed(&mut self, s: Input, t: f64) -> Result<Value> {
        if s.iter().any(|v| !v.is_finite() || v.abs() > 1.) {
            return Err("Input must contain six finite normalized axes.".into());
        }
        self.call(&json!({"op":"feed","time":t,"input":input_json(s)}))
    }
    fn configured(&self, i: usize, patch: &Value) -> Result<Value> {
        let e = &self.entries[i];
        let o = &e.def["options"];
        let allowed: Vec<&str> = match string(&e.def, "kind", "") {
            "continuous" => vec![
                "speed",
                "deadzone",
                "responseMs",
                "curve",
                "scale",
                "sectors",
                "hysteresis",
                "sticky",
            ],
            "interaction" => vec!["enter", "leave", "holdMs", "releaseMs", "valueOptions"],
            _ => patch
                .as_object()
                .ok_or("Invalid settings.")?
                .keys()
                .chain(o.as_object().unwrap().keys())
                .map(String::as_str)
                .filter(|k| !["count", "direction", "ownership"].contains(k))
                .collect(),
        };
        if patch
            .as_object()
            .ok_or("Invalid settings.")?
            .keys()
            .any(|k| !allowed.contains(&k.as_str()))
        {
            return Err("Structural/unknown control setting.".into());
        }
        let mut next = e.def.clone();
        next["options"] = merge(o, patch);
        normalize(&next)
    }
    pub fn call(&mut self, r: &Value) -> Result<Value> {
        self.events.clear();
        let op = string(r, "op", "");
        let t = number(r, "time", f64::NAN);
        let value = match op {
            "read" => {
                let i = self.index(&r["control"])?;
                let e = &mut self.entries[i];
                if e.def["kind"] == "gesture" {
                    return Err("A gesture is an occurrence; use on/events, not read.".into());
                }
                if e.def["kind"] == "interaction" {
                    if e.active {
                        json!({"status":"active","sessionId":e.session,"startedAt":e.started,"value":e.value})
                    } else {
                        json!({"status":"inactive"})
                    }
                } else if e.eligible(&self.context) {
                    if e.value_def.as_ref().unwrap()["options"]["as"] == "direction" {
                        e.value.clone()
                    } else {
                        e.interpret(self.sample)
                    }
                } else {
                    let d = e.value_def.as_ref().unwrap();
                    if d["options"]["as"] == "direction" {
                        Value::Null
                    } else {
                        shaped(d, vec![0.; e.velocity.len()])
                    }
                }
            }
            "settings" => {
                json!({"version":1,"controls":self.entries.iter().map(|e|(e.name.clone(),e.def["options"].clone())).collect::<serde_json::Map<_,_>>()})
            }
            "inspect" => {
                let selected = if r.get("control").is_some() {
                    vec![self.index(&r["control"])?]
                } else {
                    (0..self.entries.len()).collect()
                };
                json!({"context":self.context,"input":input_json(self.sample),"controls":selected.into_iter().map(|i|{let e=&self.entries[i];json!({"name":e.name,"kind":e.def["kind"],"definition":e.def,"settings":e.def["options"],"ownership":{"mode":e.mode,"channels":e.channels.iter().map(|&i|AXES[i]).collect::<Vec<_>>()},"eligible":e.eligible(&self.context),"suppressedBy":e.suppressed.clone().or_else(||e.blocked.then(||"neutral-rearm".into())),"sessionId":e.active.then_some(e.session),"cancellation":e.cancel_recognizer.as_ref().map(Gestures::state),"releasePending":e.releasing.is_some(),"prefers":self.preferences[i].iter().map(|&j|self.entries[j].name.clone()).collect::<Vec<_>>()})}).collect::<Vec<_>>()})
            }
            "recording" => {
                if !self.record {
                    return Err("Recording was not enabled.".into());
                }
                json!({"version":1,"definition":self.definition,"timeline":self.timeline,"full":self.full})
            }
            "recordingFull" => json!(self.full),
            "events" => json!(self.log),
            "validateConfigure" => {
                let i = self.index(&r["control"])?;
                self.configured(i, &r["settings"])?;
                Value::Null
            }
            "restoreSettings" | "validateRestoreSettings" => {
                let saved = &r["settings"];
                let controls = saved["controls"]
                    .as_object()
                    .ok_or("Settings do not match this definition.")?;
                if saved["version"] != 1
                    || controls.len() != self.entries.len()
                    || self.entries.iter().any(|e| !controls.contains_key(&e.name))
                {
                    return Err("Settings do not match this definition.".into());
                }
                let mut changes = vec![];
                for (i, e) in self.entries.iter().enumerate() {
                    let mut next = e.def.clone();
                    next["options"] = controls[&e.name].clone();
                    let next = normalize(&next)?;
                    let patch: serde_json::Map<_, _> = next["options"]
                        .as_object()
                        .unwrap()
                        .iter()
                        .filter(|(k, v)| e.def["options"].get(k.as_str()) != Some(*v))
                        .map(|(k, v)| (k.clone(), v.clone()))
                        .collect();
                    self.configured(i, &Value::Object(patch.clone()))?;
                    changes.push((e.name.clone(), patch));
                }
                if op == "validateRestoreSettings" {
                    return Ok(
                        json!({"value":changes.into_iter().filter(|(_,p)|!p.is_empty()).map(|(name,patch)|json!({"control":name,"settings":patch})).collect::<Vec<_>>(),"events":[]}),
                    );
                }
                let mut all_events = vec![];
                for (name, patch) in changes {
                    if !patch.is_empty() {
                        let out = self.call(
                            &json!({"op":"configure","control":name,"settings":patch,"time":t}),
                        )?;
                        all_events.extend(out["events"].as_array().unwrap().iter().cloned());
                    }
                }
                self.events = all_events;
                Value::Null
            }
            "feed" | "advance" | "frame" | "interrupt" | "cancel" | "context" | "configure" => {
                let sample = if op == "feed" {
                    Some(input(&r["input"])?)
                } else {
                    None
                };
                if sample.is_some_and(|s| s.iter().any(|v| v.abs() > 1.)) {
                    return Err("Input must contain six finite normalized axes.".into());
                }
                let i = if ["cancel", "configure"].contains(&op) {
                    Some(self.index(&r["control"])?)
                } else {
                    None
                };
                let next = if op == "configure" {
                    Some(self.configured(i.unwrap(), &r["settings"])?)
                } else {
                    None
                };
                if op == "cancel" && self.entries[i.unwrap()].def["kind"] != "interaction" {
                    return Err("Only interactions can be canceled.".into());
                }
                if op == "context"
                    && !self
                        .contexts
                        .iter()
                        .any(|c| Some(c.as_str()) == r["context"].as_str())
                {
                    return Err("Unknown context.".into());
                }
                let start = self.frame_at.unwrap_or(t);
                self.advance_to(
                    t,
                    ["interrupt", "cancel", "context", "configure"].contains(&op),
                )?;
                if self.record {
                    if self.timeline.len() < self.recording_limit {
                        let mut item = r.clone();
                        item.as_object_mut().unwrap().remove("op");
                        item["type"] = json!(op);
                        self.timeline.push(item);
                    } else {
                        self.full = true;
                    }
                }
                let mut value = Value::Null;
                match op {
                    "feed" => {
                        self.sample = sample.unwrap();
                        self.process(t, true)?;
                    }
                    "advance" => {}
                    "frame" => {
                        let results: serde_json::Map<_, _> = self
                            .entries
                            .iter_mut()
                            .filter_map(|e| {
                                let d = e.value_def.as_ref()?;
                                if d["options"]["as"] != "velocity" {
                                    return None;
                                }
                                let v = shaped(d, e.total.clone());
                                e.total.fill(0.);
                                Some((e.name.clone(), v))
                            })
                            .collect();
                        self.frame_at = Some(t);
                        value = json!({"start":start,"end":t,"results":results});
                    }
                    "interrupt" => {
                        for i in 0..self.entries.len() {
                            self.reset(i, t, string(r, "reason", "pause"))?;
                        }
                        self.sample = [0.; 6];
                    }
                    "cancel" => {
                        self.end(i.unwrap(), t, Some("explicit"));
                        self.route(t, false)?;
                    }
                    "context" => {
                        let context = r["context"].as_str().unwrap().to_string();
                        if self.context.as_ref() != Some(&context) {
                            for i in 0..self.entries.len() {
                                self.reset(i, t, "context-change")?;
                            }
                            self.context = Some(context);
                            self.route(t, false)?;
                        }
                    }
                    "configure" => {
                        let i = i.unwrap();
                        if self.entries[i].def["kind"] == "continuous" {
                            self.entries[i].velocity.fill(0.);
                        } else {
                            self.reset(i, t, "configuration-change")?;
                        }
                        let e = &mut self.entries[i];
                        e.def = next.unwrap();
                        e.value_def = value_definition(&e.def)?;
                        let (mode, channels) = ownership(&e.def)?;
                        e.mode = mode;
                        e.channels = channels;
                        if e.def["kind"] == "gesture" {
                            e.recognizer = Some(Gestures::new(e.def["options"].clone())?);
                        }
                        self.process(t, false)?;
                    }
                    _ => unreachable!(),
                }
                self.flush();
                value
            }
            _ => return Err("Unknown runtime operation.".into()),
        };
        Ok(json!({"value":value,"events":self.events}))
    }
}
