use crate::*;
pub struct Motion {
    pub current: Input,
    pub velocity: [f64; 3],
    previous: Option<f64>,
    pub zoom: String,
    options: Value,
}
impl Motion {
    pub fn new(options: Value) -> Result<Self> {
        for (k, d) in [
            ("panSpeed", 1320.),
            ("zoomSpeed", 1.5),
            ("responseMs", 25.),
            ("maxFrameMs", 50.),
        ] {
            finite(number(&options, k, d), k, 0., f64::MAX)?;
        }
        for (k, d) in [("panDeadzone", 0.05), ("zoomDeadzone", 0.1)] {
            let n = number(&options, k, d);
            if !(0.0..1.0).contains(&n) {
                return Err("Speeds and times must be finite and non-negative; deadzones must be in [0, 1).".into());
            }
        }
        Ok(Self {
            current: [0.; 6],
            velocity: [0.; 3],
            previous: None,
            zoom: string(&options, "zoomInput", "twist").into(),
            options,
        })
    }
    pub fn reset(&mut self) {
        self.current = [0.; 6];
        self.velocity = [0.; 3];
        self.previous = None;
    }
    fn area(&mut self, target: f64, i: usize, dt: f64) -> f64 {
        let response = number(&self.options, "responseMs", 25.);
        if target == 0. {
            self.velocity[i] = 0.;
            return 0.;
        }
        if response == 0. {
            self.velocity[i] = target;
            return target * dt / 1000.;
        }
        let initial = if self.velocity[i] * target < 0. {
            0.
        } else {
            self.velocity[i]
        };
        let blend = -(-dt / response).exp_m1();
        self.velocity[i] = initial + (target - initial) * blend;
        (target * dt + (initial - target) * response * blend) / 1000.
    }
    pub fn step(&mut self, t: f64) -> Value {
        if self.previous.is_some_and(|p| t <= p) {
            return json!({"panX":0,"panY":0,"zoomFactor":1,"moving":false});
        }
        let dt = self
            .previous
            .map_or(0., |p| number(&self.options, "maxFrameMs", 50.).min(t - p));
        self.previous = Some(t);
        let dz = |v: f64, threshold: f64| {
            let v = v.clamp(-1., 1.);
            if v.abs() <= threshold {
                0.
            } else {
                v.signum() * (v.abs() - threshold) / (1. - threshold)
            }
        };
        let x = self.area(
            dz(-self.current[0], number(&self.options, "panDeadzone", 0.05)),
            0,
            dt,
        ) * number(&self.options, "panSpeed", 1320.);
        let y = self.area(
            dz(-self.current[1], number(&self.options, "panDeadzone", 0.05)),
            1,
            dt,
        ) * number(&self.options, "panSpeed", 1320.);
        let z = self.area(
            dz(
                self.current[if self.zoom == "press" { 2 } else { 5 }],
                number(&self.options, "zoomDeadzone", 0.1),
            ),
            2,
            dt,
        ) * number(&self.options, "zoomSpeed", 1.5);
        json!({"panX":x,"panY":y,"zoomFactor":z.exp(),"moving":x!=0.||y!=0.||z!=0.})
    }
}
