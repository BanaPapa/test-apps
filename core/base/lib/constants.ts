// 화면(브라우저)과 서버가 함께 쓰는 고정값. 이 파일은 node 모듈을 import 하지 않는다.

/** 예시 데이터가 들어 있는 지역: 서울특별시 강남구 */
export const SAMPLE_SIDO_CODE = '11';
export const SAMPLE_LAWD_CD = '11680';

/** 예시 데이터의 첫 달과 마지막 달. 예시 모드에서는 '이번 달' 대신 마지막 달을 기준으로 삼는다. */
export const SAMPLE_FIRST_YM = '202510';
export const SAMPLE_LATEST_YM = '202610';

/** 한 번에 조회할 수 있는 최대 개월 수 */
export const MAX_MONTHS = 36;

/** 공공데이터포털 인증키 발급 안내 */
export const MOLIT_KEY_GUIDE_URL = 'https://www.data.go.kr/data/15126469/openapi.do';
