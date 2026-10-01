use crate::*;
const DIRS: [&str; 8] = [
    "clockwise",
    "counterclockwise",
    "push",
    "pull",
    "rx+",
    "rx-",
    "ry+",
    "ry-",
];
fn tilt(d: usize) -> bool {
    d >= 4
}
#[derive(Clone)]
struct Event {
    direction: usize,
    kind: &'static str,
    timestamp: f64,
    duration: f64,
    tilt: Option<usize>,
    rotation: Option<usize>,
}
impl Event {
    fn json(&self) -> Value {
        let mut v = json!({"direction":DIRS[self.direction],"kind":self.kind,"timestamp":self.timestamp,"durationMs":self.duration});
        if let Some(t) = self.tilt {
            v["tilt"] = json!(DIRS[t])
        }
        if let Some(r) = self.rotation {
            v["rotation"] = json!(DIRS[r])
        }
        v
    }
}
#[derive(Clone)]
struct Active {
    direction: usize,
    start: f64,
    tilt: Option<usize>,
    tilt_peak: f64,
    candidate: Option<usize>,
    candidate_at: Option<f64>,
    candidate_peak: f64,
    attempted: bool,
    borrowed: bool,
    eligible: bool,
}
impl Active {
    fn new(direction: usize, start: f64, eligible: bool) -> Self {
        Self {
            direction,
            start,
            tilt: None,
            tilt_peak: 0.,
            candidate: None,
            candidate_at: None,
            candidate_peak: 0.,
            attempted: false,
            borrowed: false,
            eligible,
        }
    }
}
#[derive(Clone)]
struct Pair {
    direction: usize,
    rotation: usize,
    start: f64,
    holding: bool,
    pressure: f64,
    strength: f64,
}
pub struct Gestures {
    o: Value,
    gates: [[f64; 2]; 8],
    modes: [String; 2],
    last: f64,
    pulse_last: f64,
    sample: Input,
    phase: &'static str,
    active: Option<Active>,
    released: Option<f64>,
    pending: Option<Event>,
    pair: Option<Pair>,
    armed: Option<usize>,
    blocked: bool,
}
impl Gestures {
    fn n(&self, k: &str, d: f64) -> f64 {
        number(&self.o, k, d)
    }
    fn b(&self, k: &str, d: bool) -> bool {
        boolean(&self.o, k, d)
    }
    fn immediate(&self) -> bool {
        string(&self.o, "singleMode", "exclusive") == "immediate"
    }
    fn mode(&self, d: usize) -> &str {
        if d == 2 || d == 3 {
            &self.modes[d - 2]
        } else {
            "simple"
        }
    }
    fn tilt_mode(&self, d: usize) -> bool {
        (d == 2 || d == 3) && self.mode(d) != "simple"
    }
    fn combined(&self) -> bool {
        self.modes.iter().any(|m| m != "simple")
    }
    fn dwell(&self, d: usize) -> f64 {
        if tilt(d) {
            self.n("standaloneNeutralMs", 10.)
        } else {
            self.n("neutralMs", 25.)
        }
    }
    fn double_window(&self, d: usize) -> f64 {
        if tilt(d) {
            self.n("standaloneDoubleMs", 400.)
        } else {
            self.n("doubleMs", 400.)
        }
    }
    fn deadline(&self, e: &Event) -> f64 {
        e.timestamp
            + if self.tilt_mode(e.direction) {
                self.n("doubleMs", 400.)
                    .max(self.n("tiltRelaxMs", 180.) + self.n("tiltMinMs", 25.))
            } else {
                self.double_window(e.direction)
            }
    }
    fn pending_start(&self) -> f64 {
        self.pending
            .as_ref()
            .map_or(0., |p| p.timestamp - self.n("neutralMs", 25.) - p.duration)
    }
    fn can_resume(&self, t: f64) -> bool {
        self.pending.as_ref().is_some_and(|p| {
            self.tilt_mode(p.direction)
                && t <= p.timestamp - self.n("neutralMs", 25.) + self.n("tiltRelaxMs", 180.)
                && t <= self.pending_start() + self.n("tiltArmMs", 450.)
        })
    }
    fn tilt_neutral(&self) -> bool {
        self.sample[3].abs().max(self.sample[4].abs()) <= self.n("tiltRelease", 0.115)
    }
    fn side_rest(&self) -> bool {
        self.sample[3].abs() <= self.gates[4][1] && self.sample[4].abs() <= self.gates[6][1]
    }
    fn neutral(&self) -> bool {
        if self.active.as_ref().is_some_and(|a| tilt(a.direction)) {
            return self.side_rest();
        }
        self.sample[2].abs() <= self.gates[if self.sample[2] >= 0. { 2 } else { 3 }][1]
            && self.sample[5].abs() <= self.gates[if self.sample[5] >= 0. { 0 } else { 1 }][1]
            && (!(self
                .active
                .as_ref()
                .map_or(self.combined(), |a| self.tilt_mode(a.direction)))
                || self.tilt_neutral())
            && (self.active.is_some() || !self.b("standaloneTilt", true) || self.side_rest())
    }
    fn side(&self) -> Option<usize> {
        let rx = self.sample[3];
        let ry = self.sample[4];
        let a = self.n("tiltActivation", 0.24);
        let d = self.n("tiltDominance", 1.25);
        if rx.abs() >= a && rx.abs() >= ry.abs() * d {
            Some(if rx > 0. { 4 } else { 5 })
        } else if ry.abs() >= a && ry.abs() >= rx.abs() * d {
            Some(if ry > 0. { 6 } else { 7 })
        } else {
            None
        }
    }
    fn clock(&mut self, t: f64, pulse: bool) -> Result<()> {
        let last = if pulse {
            &mut self.pulse_last
        } else {
            &mut self.last
        };
        if !t.is_finite() || t < *last {
            return Err("Gesture timestamps must be finite and monotonic.".into());
        }
        *last = t;
        Ok(())
    }
    pub fn new(o: Value) -> Result<Self> {
        if !o.is_object()
            || ["pressMode", "pushMode", "pullMode", "singleMode"]
                .iter()
                .any(|k| o.get(*k).is_some_and(|v| !v.is_string()))
        {
            return Err("Invalid gesture options.".into());
        }
        let n = |k, d| number(&o, k, d);
        let activation = n("activation", 0.35);
        let release = n("release", 0.12);
        let pa = n("pressActivation", n("activation", f64::NAN));
        let pr = n("pressRelease", n("release", f64::NAN));
        let ta = n("twistActivation", n("activation", 0.25));
        let tr = n("twistRelease", n("release", 0.15));
        let gates = [
            [n("clockwiseActivation", ta), n("clockwiseRelease", tr)],
            [
                n("counterclockwiseActivation", ta),
                n("counterclockwiseRelease", tr),
            ],
            [
                n("pushActivation", if pa.is_nan() { 0.20 } else { pa }),
                n("pushRelease", if pr.is_nan() { 0.08 } else { pr }),
            ],
            [
                n("pullActivation", if pa.is_nan() { 0.12 } else { pa }),
                n("pullRelease", if pr.is_nan() { 0.06 } else { pr }),
            ],
            [n("tiltXActivation", 0.13), n("tiltXRelease", 0.104)],
            [n("tiltXActivation", 0.13), n("tiltXRelease", 0.104)],
            [n("tiltYActivation", 0.28), n("tiltYRelease", 0.16)],
            [n("tiltYActivation", 0.28), n("tiltYRelease", 0.16)],
        ];
        let modes = [
            string(&o, "pushMode", string(&o, "pressMode", "auto")).to_string(),
            string(&o, "pullMode", string(&o, "pressMode", "auto")).to_string(),
        ];
        if !activation.is_finite()
            || !release.is_finite()
            || release < 0.
            || activation <= release
            || activation > 1.
            || gates.iter().any(|g| {
                !g[0].is_finite() || !g[1].is_finite() || g[1] < 0. || g[0] <= g[1] || g[0] > 1.
            })
            || n("dominance", 1.4) < 1.
            || n("maxPulseMs", 650.) < n("minPulseMs", 35.)
        {
            return Err("Invalid gesture options.".into());
        }
        for (k, d) in [
            ("minPulseMs", 35.),
            ("maxPulseMs", 650.),
            ("neutralMs", 25.),
            ("doubleMs", 400.),
            ("dominance", 1.4),
            ("standaloneMinPulseMs", 25.),
            ("standaloneMaxPulseMs", 650.),
            ("standaloneNeutralMs", 10.),
            ("standaloneDoubleMs", 400.),
            ("tiltMinMs", 25.),
            ("tiltArmMs", 450.),
            ("tiltRelaxMs", 180.),
            ("tiltMaxMs", 1000.),
            ("rotateMinMs", 25.),
            ("rotateHoldMs", 250.),
        ] {
            finite(n(k, d), k, 0., f64::MAX)?;
            if o.get(k).is_some_and(|v| !v.is_number()) {
                return Err(format!("Invalid {k}."));
            }
        }
        if !["exclusive", "immediate"].contains(&string(&o, "singleMode", "exclusive")) {
            return Err("Invalid gesture options.".into());
        }
        if modes
            .iter()
            .any(|m| !["simple", "tilt", "auto"].contains(&m.as_str()))
            || n("tiltActivation", 0.24) <= n("tiltRelease", 0.115)
            || n("tiltRelease", 0.115) < 0.
            || n("tiltActivation", 0.24) > 1.
            || n("tiltDominance", 1.25) <= 1.
            || n("tiltArmMs", 450.) < n("tiltMinMs", 25.)
            || n("tiltArmMs", 450.) > n("tiltMaxMs", 1000.)
            || n("tiltMaxMs", 1000.) > 10000.
            || n("tiltRelaxMs", 180.) > n("tiltArmMs", 450.)
            || modes.iter().any(|m| m != "simple")
                && string(&o, "singleMode", "exclusive") != "exclusive"
        {
            return Err(
                "Invalid press-tilt options; combined gestures require exclusive single mode."
                    .into(),
            );
        }
        if n("rotateHoldMs", 250.) < n("rotateMinMs", 25.)
            || n("standaloneMaxPulseMs", 650.) < n("standaloneMinPulseMs", 25.)
            || ["pressRotate", "standaloneTilt"]
                .iter()
                .any(|k| o.get(*k).is_some_and(|v| !v.is_boolean()))
        {
            return Err("Invalid gesture options.".into());
        }
        Ok(Self {
            o,
            gates,
            modes,
            last: f64::NEG_INFINITY,
            pulse_last: f64::NEG_INFINITY,
            sample: [0.; 6],
            phase: "blocked",
            active: None,
            released: None,
            pending: None,
            pair: None,
            armed: None,
            blocked: true,
        })
    }
    fn pulse_tick(&mut self, t: f64) -> Vec<Event> {
        let mut events = vec![];
        if let Some(a) = self.active.clone()
            && let (Some(c), Some(at)) = (a.candidate, a.candidate_at)
            && t >= at + self.n("tiltMinMs", 25.)
            && (a.tilt.is_none()
                || a.tilt == Some(c)
                || a.candidate_peak > a.tilt_peak * self.n("tiltDominance", 1.25))
        {
            let resume = self.can_resume(at)
                && self
                    .pending
                    .as_ref()
                    .is_some_and(|p| p.direction == a.direction);
            let start = self.pending_start();
            let active = self.active.as_mut().unwrap();
            if resume {
                active.start = start;
                self.pending = None;
            }
            active.tilt = Some(c);
            active.tilt_peak = a.tilt_peak.max(a.candidate_peak);
        }
        if let (Some(released), Some(a)) = (self.released, self.active.clone())
            && self.phase == "releasing"
            && t >= released + self.dwell(a.direction)
        {
            let duration = released - a.start;
            let completed = released + self.dwell(a.direction);
            if a.tilt.is_some() && duration <= self.n("tiltMaxMs", 1000.) {
                if let Some(mut p) = self.pending.take()
                    && self.mode(p.direction) != "tilt"
                {
                    p.timestamp = completed.min(self.deadline(&p));
                    events.push(p)
                }
                events.push(Event {
                    direction: a.direction,
                    tilt: a.tilt,
                    rotation: None,
                    kind: "single",
                    timestamp: completed,
                    duration,
                });
            } else if !a.borrowed
                && !a.attempted
                && duration
                    >= if tilt(a.direction) {
                        self.n("standaloneMinPulseMs", 25.)
                    } else {
                        self.n("minPulseMs", 35.)
                    }
                && duration
                    <= if tilt(a.direction) {
                        self.n("standaloneMaxPulseMs", 650.)
                    } else {
                        self.n("maxPulseMs", 650.)
                    }
            {
                let pulse = Event {
                    direction: a.direction,
                    kind: "single",
                    timestamp: completed,
                    duration,
                    tilt: None,
                    rotation: None,
                };
                if self.pending.as_ref().is_some_and(|p| {
                    p.direction == pulse.direction
                        && completed - p.timestamp <= self.double_window(pulse.direction)
                }) {
                    let mut double = pulse;
                    double.kind = "double";
                    events.push(double);
                    self.pending = None;
                } else {
                    if let Some(mut p) = self.pending.take()
                        && !self.immediate()
                        && self.mode(p.direction) != "tilt"
                    {
                        p.timestamp = completed.min(self.deadline(&p));
                        events.push(p)
                    }
                    self.pending = Some(pulse.clone());
                    if self.immediate() && self.mode(pulse.direction) != "tilt" {
                        events.push(pulse)
                    }
                }
            }
            self.active = None;
            self.released = None;
            self.phase = "neutral";
        }
        if let Some(a) = &self.active {
            let limit = if tilt(a.direction) {
                self.n("standaloneMaxPulseMs", 650.)
            } else if a.tilt.is_some() || a.candidate.is_some() {
                self.n("tiltMaxMs", 1000.)
            } else {
                self.n("maxPulseMs", 650.)
            };
            if self.phase == "active" && t - a.start > limit {
                self.phase = "blocked";
                self.active = None;
            }
        }
        if self.pending.as_ref().is_some_and(|p| t > self.deadline(p)) {
            let mut p = self.pending.take().unwrap();
            if !self.immediate() && self.mode(p.direction) != "tilt" {
                p.timestamp = self.deadline(&p);
                events.push(p)
            }
        }
        events
    }
    fn cancel_excursion(&mut self) {
        self.active = None;
        self.released = None;
        self.phase = "blocked";
    }
    fn pulse_update(&mut self, input: Input, t: f64) -> Result<Vec<Event>> {
        self.clock(t, true)?;
        let mut events = self.pulse_tick(t);
        let was_below =
            self.sample[3].abs().max(self.sample[4].abs()) < self.n("tiltActivation", 0.24);
        self.sample[2] = input[2].clamp(-1., 1.);
        self.sample[5] = input[5].clamp(-1., 1.);
        if self.combined() || self.b("standaloneTilt", true) {
            self.sample[3] = input[3].clamp(-1., 1.);
            self.sample[4] = input[4].clamp(-1., 1.);
        }
        if self.phase == "blocked" {
            if self.neutral() {
                self.phase = "neutral"
            }
            return Ok(events);
        }
        let side = if self.combined() || self.b("standaloneTilt", true) {
            self.side()
        } else {
            None
        };
        if self.active.is_none() && side.is_some() && self.can_resume(t) {
            let mut a = Active::new(
                self.pending.as_ref().unwrap().direction,
                self.pending_start(),
                true,
            );
            a.borrowed = true;
            self.active = Some(a);
            self.phase = "active";
        }
        if let Some(mut a) = self.active.clone() {
            if self.tilt_mode(a.direction) && a.eligible {
                if self.sample[3].abs().max(self.sample[4].abs()) >= self.n("tiltActivation", 0.24)
                {
                    a.attempted = true
                }
                if let Some(s) = side.filter(|s| {
                    a.tilt.is_some()
                        || a.candidate == Some(*s)
                        || t - a.start <= self.n("tiltArmMs", 450.)
                }) {
                    let strength = self.sample[if s < 6 { 3 } else { 4 }].abs();
                    if a.candidate != Some(s) {
                        a.candidate = Some(s);
                        a.candidate_at = Some(t);
                        a.candidate_peak = strength
                    } else {
                        a.candidate_peak = a.candidate_peak.max(strength)
                    }
                } else {
                    a.candidate = None;
                    a.candidate_at = None;
                    a.candidate_peak = 0.;
                }
            }
            let signed = match a.direction {
                0 => self.sample[5],
                1 => -self.sample[5],
                2 => self.sample[2],
                3 => -self.sample[2],
                d => self.sample[if d < 6 { 3 } else { 4 }] * if d % 2 == 0 { 1. } else { -1. },
            };
            self.active = Some(a.clone());
            if self.neutral() {
                if self.released.is_none() {
                    self.released = Some(t)
                }
                self.phase = "releasing";
            } else if signed < -self.gates[a.direction][1] {
                self.cancel_excursion()
            } else {
                self.phase = "active";
                self.released = None;
            }
        } else {
            let z = self.sample[2];
            let rz = self.sample[5];
            let vertical = z.abs() >= rz.abs();
            let mut strong = if vertical { z.abs() } else { rz.abs() };
            let mut weak = if vertical { rz.abs() } else { z.abs() };
            let mut d = if vertical {
                if z > 0. { 2 } else { 3 }
            } else if rz > 0. {
                0
            } else {
                1
            };
            if self.b("standaloneTilt", true) {
                let axis = if self.sample[3].abs() >= self.sample[4].abs() {
                    3
                } else {
                    4
                };
                let strength = self.sample[axis].abs();
                let direction = if axis == 3 { 4 } else { 6 };
                if strength >= self.gates[direction][0] {
                    if strength > strong {
                        weak = strong.max(self.sample[if axis == 3 { 4 } else { 3 }].abs());
                        strong = strength;
                        d = direction + usize::from(self.sample[axis] <= 0.);
                    } else {
                        weak = weak.max(strength)
                    }
                }
            }
            if strong >= self.gates[d][0] && strong >= weak * self.n("dominance", 1.4) {
                let mut a = Active::new(d, t, was_below);
                if self.tilt_mode(d)
                    && a.eligible
                    && let Some(s) = side
                {
                    a.candidate = Some(s);
                    a.candidate_at = Some(t);
                    a.candidate_peak = self.sample[if s < 6 { 3 } else { 4 }].abs();
                    a.attempted = true;
                }
                self.active = Some(a);
                self.phase = "active";
            }
        }
        events.extend(self.pulse_tick(t));
        Ok(events)
    }
    fn pair_event(&self, kind: &'static str, t: f64) -> Event {
        let p = self.pair.as_ref().unwrap();
        Event {
            direction: p.direction,
            rotation: Some(p.rotation),
            tilt: None,
            kind,
            timestamp: t,
            duration: t - p.start,
        }
    }
    fn pair_tick(&mut self, t: f64) -> Vec<Event> {
        if self
            .pair
            .as_ref()
            .is_some_and(|p| !p.holding && t >= p.start + self.n("rotateHoldMs", 250.))
        {
            self.pair.as_mut().unwrap().holding = true;
            return vec![self.pair_event(
                "holdstart",
                self.pair.as_ref().unwrap().start + self.n("rotateHoldMs", 250.),
            )];
        }
        vec![]
    }
    pub fn update(&mut self, input: Input, t: f64) -> Result<Value> {
        if input.iter().any(|v| !v.is_finite()) {
            return Err("Gesture axes must be finite.".into());
        }
        self.clock(t, false)?;
        if !self.b("pressRotate", true) {
            return Ok(Value::Array(
                self.pulse_update(input, t)?
                    .iter()
                    .map(Event::json)
                    .collect(),
            ));
        }
        let z = input[2].clamp(-1., 1.);
        let rz = input[5].clamp(-1., 1.);
        let direction = if z >= 0. { 2 } else { 3 };
        let rotation = if rz >= 0. { 0 } else { 1 };
        let tilt_rest = input[3].abs() <= self.n("tiltRelease", 0.115).min(self.gates[4][1])
            && input[4].abs() <= self.n("tiltRelease", 0.115).min(self.gates[6][1]);
        let rest =
            z.abs() <= self.gates[direction][1] && rz.abs() <= self.gates[rotation][1] && tilt_rest;
        if let Some(p) = self.pair.clone() {
            self.clock(t, true)?;
            let mut events = self.pulse_tick(t);
            events.extend(self.pair_tick(t));
            let pressure = z * if p.direction == 2 { 1. } else { -1. };
            let strength = rz * if p.rotation == 0 { 1. } else { -1. };
            let reversed = pressure < -self.gates[if p.direction == 2 { 3 } else { 2 }][1]
                || strength < -self.gates[if p.rotation == 0 { 1 } else { 0 }][1];
            if reversed
                || pressure <= self.gates[p.direction][1]
                || strength <= self.gates[p.rotation][1]
            {
                if self.pair.as_ref().unwrap().holding {
                    events.push(self.pair_event(if reversed { "holdcancel" } else { "holdend" }, t))
                } else if !reversed && t - p.start >= self.n("rotateMinMs", 25.) {
                    events.push(self.pair_event("single", t))
                }
                self.pair = None;
                self.armed = None;
                self.blocked = !rest;
                self.cancel_excursion();
                if rest {
                    self.pulse_update(input, t)?;
                }
            } else {
                let p = self.pair.as_mut().unwrap();
                p.pressure = pressure;
                p.strength = strength;
            }
            return Ok(Value::Array(events.iter().map(Event::json).collect()));
        }
        if rest {
            self.blocked = false;
            self.armed = None;
        }
        if !self.blocked {
            if self.armed.is_none()
                && z.abs() >= self.gates[direction][0]
                && (rz.abs() < self.gates[rotation][0]
                    || z.abs() * self.n("dominance", 1.4) >= rz.abs())
                && tilt_rest
            {
                self.armed = Some(direction)
            }
            if let Some(a) = self.armed
                && (z * if a == 2 { 1. } else { -1. } <= self.gates[a][1] || !tilt_rest)
            {
                self.armed = None;
                self.blocked = !rest;
            }
            if let Some(a) = self.armed
                && rz.abs() >= self.gates[rotation][0]
            {
                self.pair = Some(Pair {
                    direction: a,
                    rotation,
                    start: t,
                    holding: false,
                    pressure: z.abs(),
                    strength: rz.abs(),
                });
                self.cancel_excursion();
                self.clock(t, true)?;
                let mut events = self.pulse_tick(t);
                events.extend(self.pair_tick(t));
                return Ok(Value::Array(events.iter().map(Event::json).collect()));
            }
            if self.armed.is_none() && (rz.abs() >= self.gates[rotation][0] || !tilt_rest) {
                self.blocked = true;
            }
        }
        Ok(Value::Array(
            self.pulse_update(input, t)?
                .iter()
                .map(Event::json)
                .collect(),
        ))
    }
    pub fn advance(&mut self, t: f64) -> Result<Value> {
        self.clock(t, false)?;
        self.clock(t, true)?;
        let mut events = self.pulse_tick(t);
        if self.pair.is_some() {
            events.extend(self.pair_tick(t));
            events.sort_by(|a, b| a.timestamp.total_cmp(&b.timestamp));
        }
        Ok(Value::Array(events.iter().map(Event::json).collect()))
    }
    pub fn reset(&mut self, t: Option<f64>) -> Result<Value> {
        let t = t.unwrap_or(if self.last.is_finite() { self.last } else { 0. });
        if self.b("pressRotate", true) {
            self.clock(t, false)?;
        }
        let events = if self.pair.as_ref().is_some_and(|p| p.holding) {
            vec![self.pair_event("holdcancel", t).json()]
        } else {
            vec![]
        };
        self.pair = None;
        self.armed = None;
        self.blocked = true;
        self.last = f64::NEG_INFINITY;
        self.pulse_last = f64::NEG_INFINITY;
        self.sample = [0.; 6];
        self.active = None;
        self.pending = None;
        self.released = None;
        self.phase = "blocked";
        Ok(Value::Array(events))
    }
    pub fn state(&self) -> Value {
        if let Some(p) = &self.pair {
            return json!({"phase":"active","direction":DIRS[p.direction],"pending":null,"hold":if p.holding{json!({"direction":DIRS[p.direction],"rotation":DIRS[p.rotation],"startedAt":p.start+self.n("rotateHoldMs",250.),"pressure":p.pressure,"strength":p.strength})}else{Value::Null}});
        }
        json!({"hold":null,"phase":self.phase,"direction":self.active.as_ref().map(|a|DIRS[a.direction]),"pending":self.pending.as_ref().map(|p|DIRS[p.direction])})
    }
}
